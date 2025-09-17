import { db } from "../db";
import { invoiceNumbers, invoices, annualStats } from "@shared/schema";
import { eq, and, gte, lte, desc, sum } from "drizzle-orm";

export class InvoiceNumberService {
  async getAvailableInvoiceNumber(requestedYearMonth: string, userId: string): Promise<string> {
    const currentDate = new Date();
    const currentYearMonth = this.getCurrentYearMonth();
    
    let targetYearMonth = requestedYearMonth;
    
    if (requestedYearMonth !== currentYearMonth) {
      const canOpenNext = await this.canOpenNextPeriodInvoice(currentDate);
      if (!canOpenNext) {
        throw new Error("尚未到開立下期發票的時間（每月20日後可開立下期發票）");
      }
      
      const nextYearMonth = this.getNextYearMonth();
      if (requestedYearMonth !== nextYearMonth) {
        throw new Error("只能開立當期或下期發票");
      }
    }

    const range = await this.getOrCreateNumberRange(targetYearMonth);
    return await this.allocateNextNumber(range.id, userId);
  }

  private async canOpenNextPeriodInvoice(currentDate: Date): Promise<boolean> {
    return currentDate.getDate() >= 20;
  }

  private getCurrentYearMonth(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    
    const period = Math.ceil(month / 2);
    const startMonth = (period - 1) * 2 + 1;
    const endMonth = period * 2;
    
    return `${year}${startMonth.toString().padStart(2, '0')}${endMonth.toString().padStart(2, '0')}`;
  }

  private getNextYearMonth(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    
    const currentPeriod = Math.ceil(month / 2);
    let nextPeriod = currentPeriod + 1;
    let nextYear = year;
    
    if (nextPeriod > 6) {
      nextPeriod = 1;
      nextYear = year + 1;
    }
    
    const startMonth = (nextPeriod - 1) * 2 + 1;
    const endMonth = nextPeriod * 2;
    
    return `${nextYear}${startMonth.toString().padStart(2, '0')}${endMonth.toString().padStart(2, '0')}`;
  }

  private async getUploadCutoffDate(yearMonth: string): Promise<Date> {
    const year = parseInt(yearMonth.substring(0, 4));
    const endMonth = parseInt(yearMonth.substring(4, 6));
    
    const cutoffDate = new Date(year, endMonth, 15);
    return cutoffDate;
  }

  private async getOrCreateNumberRange(yearMonth: string): Promise<{ id: number; yearMonth: string; prefix: string; startNumber: number; endNumber: number; currentNumber: number; isActive: boolean; downloadedAt: Date | null; createdAt: Date | null; }> {
    const [existingRange] = await db
      .select()
      .from(invoiceNumbers)
      .where(and(
        eq(invoiceNumbers.yearMonth, yearMonth),
        eq(invoiceNumbers.isActive, true)
      ));

    if (existingRange) {
      return existingRange;
    }

    return await this.downloadNewNumberRange(yearMonth);
  }

  private async downloadNewNumberRange(yearMonth: string): Promise<{ id: number; yearMonth: string; prefix: string; startNumber: number; endNumber: number; currentNumber: number; isActive: boolean; downloadedAt: Date | null; createdAt: Date | null; }> {
    const prefix = `${yearMonth.substring(2)}`;
    const startNumber = 10000001;
    const endNumber = 10000500;

    const [range] = await db
      .insert(invoiceNumbers)
      .values({
        yearMonth,
        prefix,
        startNumber,
        endNumber,
        currentNumber: startNumber,
        isActive: true,
        downloadedAt: new Date(),
      })
      .returning();

    return range;
  }

  private async allocateNextNumber(rangeId: number, userId: string): Promise<string> {
    const [range] = await db
      .select()
      .from(invoiceNumbers)
      .where(eq(invoiceNumbers.id, rangeId));

    if (!range) {
      throw new Error("發票號碼段不存在");
    }

    if (range.currentNumber > range.endNumber) {
      throw new Error("發票號碼已用完，請聯繫系統管理員");
    }

    const invoiceNumber = `${range.prefix}${range.currentNumber.toString().padStart(8, '0')}`;
    
    await db
      .update(invoiceNumbers)
      .set({ currentNumber: range.currentNumber + 1 })
      .where(eq(invoiceNumbers.id, rangeId));

    return invoiceNumber;
  }

  async voidInvoiceNumber(invoiceNumber: string, userId: string, reason: string): Promise<void> {
    const [invoice] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.invoiceNumber, invoiceNumber));

    if (!invoice) {
      throw new Error("發票不存在");
    }

    if (invoice.status === "voided") {
      throw new Error("發票已作廢");
    }

    await db
      .update(invoices)
      .set({
        status: "voided",
        voidedAt: new Date(),
        voidReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(invoices.invoiceNumber, invoiceNumber));
  }

  async getAnnualStats(year: number, userId?: string) {
    const query = db
      .select({
        totalRevenue: sum(invoices.grandTotal),
        totalInvoices: sum(invoices.id),
      })
      .from(invoices)
      .where(and(
        gte(invoices.issuedAt, new Date(year, 0, 1)),
        lte(invoices.issuedAt, new Date(year, 11, 31)),
        eq(invoices.status, "issued"),
        userId ? eq(invoices.userId, userId) : undefined
      ));

    const [stats] = await query;
    
    const totalRevenue = parseFloat(stats.totalRevenue || "0");
    const totalInvoices = parseInt(stats.totalInvoices || "0");
    
    const warningThreshold = 4800000;
    const isNearLimit = totalRevenue > warningThreshold * 0.9;

    return {
      year,
      totalRevenue,
      totalInvoices,
      isNearLimit,
      warningThreshold,
    };
  }
}

export const invoiceNumberService = new InvoiceNumberService();