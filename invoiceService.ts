import { db } from "../db";
import { invoices, invoiceItems, annualStats, auditLogs, type Invoice, type InsertInvoice, type UpdateInvoice } from "@shared/schema";
import { eq, and, gte, lte, desc, asc } from "drizzle-orm";
import { invoiceNumberService } from "./invoiceNumberService";

export class InvoiceService {
  async createInvoice(
    invoiceData: Omit<InsertInvoice, 'invoiceNumber'>,
    items: Array<{ description: string; category: string; preTaxAmount: number; taxAmount: number; totalAmount: number }>,
    userId: string
  ): Promise<Invoice> {
    return await db.transaction(async (tx) => {
      const invoiceNumber = await invoiceNumberService.getAvailableInvoiceNumber(
        invoiceData.yearMonth,
        userId
      );

      const [invoice] = await tx
        .insert(invoices)
        .values({
          ...invoiceData,
          invoiceNumber,
          userId,
          status: "issued",
        })
        .returning();

      for (const item of items) {
        await tx.insert(invoiceItems).values({
          invoiceId: invoice.id,
          sessionId: `invoice_${invoice.id}`,
          ...item,
        });
      }

      await this.updateAnnualStats(tx, userId, parseFloat(invoice.grandTotal), invoiceData.yearMonth);

      await tx.insert(auditLogs).values({
        userId,
        action: "CREATE_INVOICE",
        resourceType: "invoice",
        resourceId: invoice.id.toString(),
        details: { invoiceNumber, grandTotal: invoice.grandTotal },
      });

      return invoice;
    });
  }

  async updateInvoice(
    invoiceId: number,
    updateData: Partial<UpdateInvoice>,
    userId: string
  ): Promise<Invoice> {
    const [existingInvoice] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.id, invoiceId));

    if (!existingInvoice) {
      throw new Error("發票不存在");
    }

    if (existingInvoice.status !== "draft") {
      throw new Error("只能修改草稿狀態的發票");
    }

    const [updatedInvoice] = await db
      .update(invoices)
      .set({
        ...updateData,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoiceId))
      .returning();

    await db.insert(auditLogs).values({
      userId,
      action: "UPDATE_INVOICE",
      resourceType: "invoice",
      resourceId: invoiceId.toString(),
      details: updateData,
    });

    return updatedInvoice;
  }

  async voidInvoice(invoiceId: number, reason: string, userId: string): Promise<void> {
    const [invoice] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.id, invoiceId));

    if (!invoice) {
      throw new Error("發票不存在");
    }

    if (invoice.status === "voided") {
      throw new Error("發票已作廢");
    }

    await db.transaction(async (tx) => {
      await tx
        .update(invoices)
        .set({
          status: "voided",
          voidedAt: new Date(),
          voidReason: reason,
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, invoiceId));

      const prevAmount = parseFloat(invoice.grandTotal);
      await this.updateAnnualStats(tx, userId, -prevAmount, invoice.yearMonth);

      await tx.insert(auditLogs).values({
        userId,
        action: "VOID_INVOICE",
        resourceType: "invoice",
        resourceId: invoiceId.toString(),
        details: { reason, originalAmount: invoice.grandTotal },
      });
    });
  }

  async batchUploadInvoices(yearMonth: string, userId: string): Promise<{ success: number; failed: number }> {
    const invoicesToUpload = await db
      .select()
      .from(invoices)
      .where(and(
        eq(invoices.yearMonth, yearMonth),
        eq(invoices.status, "issued"),
        eq(invoices.uploadedAt, null)
      ));

    let successCount = 0;
    let failedCount = 0;

    for (const invoice of invoicesToUpload) {
      try {
        await this.uploadToTaxAuthority(invoice);
        
        await db
          .update(invoices)
          .set({ uploadedAt: new Date() })
          .where(eq(invoices.id, invoice.id));
        
        successCount++;
      } catch (error) {
        failedCount++;
        console.error(`Failed to upload invoice ${invoice.invoiceNumber}:`, error);
      }
    }

    await db.insert(auditLogs).values({
      userId,
      action: "BATCH_UPLOAD",
      resourceType: "invoice",
      details: { yearMonth, success: successCount, failed: failedCount },
    });

    return { success: successCount, failed: failedCount };
  }

  async getInvoiceById(invoiceId: number): Promise<Invoice | null> {
    const [invoice] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.id, invoiceId));

    return invoice || null;
  }

  async getUserInvoices(userId: string, filters?: {
    yearMonth?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<Invoice[]> {
    let query = db
      .select()
      .from(invoices)
      .where(eq(invoices.userId, userId));

    if (filters?.yearMonth) {
      query = query.where(eq(invoices.yearMonth, filters.yearMonth));
    }

    if (filters?.status) {
      query = query.where(eq(invoices.status, filters.status));
    }

    query = query.orderBy(desc(invoices.createdAt));

    if (filters?.limit) {
      query = query.limit(filters.limit);
    }

    if (filters?.offset) {
      query = query.offset(filters.offset);
    }

    return await query;
  }

  async getAnnualStats(year: number, userId?: string): Promise<any> {
    return await invoiceNumberService.getAnnualStats(year, userId);
  }

  async exportAccountingData(yearMonth: string, format: 'csv' | 'excel' = 'csv'): Promise<any[]> {
    const invoicesData = await db
      .select({
        invoiceNumber: invoices.invoiceNumber,
        issuedAt: invoices.issuedAt,
        buyerName: invoices.buyerName,
        preTaxTotal: invoices.preTaxTotal,
        taxTotal: invoices.taxTotal,
        grandTotal: invoices.grandTotal,
        status: invoices.status,
      })
      .from(invoices)
      .where(and(
        eq(invoices.yearMonth, yearMonth),
        eq(invoices.status, "issued")
      ))
      .orderBy(asc(invoices.invoiceNumber));

    return invoicesData;
  }

  private async updateAnnualStats(tx: any, userId: string, amount: number, yearMonth: string): Promise<void> {
    const year = parseInt(yearMonth.substring(0, 4));
    
    const [existingStats] = await tx
      .select()
      .from(annualStats)
      .where(and(
        eq(annualStats.userId, userId),
        eq(annualStats.year, year)
      ));

    if (existingStats) {
      await tx
        .update(annualStats)
        .set({
          totalRevenue: (parseFloat(existingStats.totalRevenue) + amount).toString(),
          totalInvoices: existingStats.totalInvoices + (amount > 0 ? 1 : -1),
          updatedAt: new Date(),
        })
        .where(eq(annualStats.id, existingStats.id));
    } else {
      await tx.insert(annualStats).values({
        userId,
        year,
        totalRevenue: amount.toString(),
        totalInvoices: amount > 0 ? 1 : 0,
      });
    }
  }

  private async uploadToTaxAuthority(invoice: any): Promise<void> {
    // 模擬上傳至國稅局API
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // 在實際環境中，這裡會呼叫真實的國稅局API
    console.log(`Uploading invoice ${invoice.invoiceNumber} to tax authority`);
  }
}

export const invoiceService = new InvoiceService();