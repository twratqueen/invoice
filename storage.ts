import {
  invoiceItems,
  invoiceNotes,
  type InvoiceItem,
  type InsertInvoiceItem,
  type UpdateInvoiceItem,
  type InvoiceNotes,
  type InsertInvoiceNotes,
} from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";

export interface IStorage {
  // Invoice Items
  getInvoiceItemsBySession(sessionId: string): Promise<InvoiceItem[]>;
  createInvoiceItem(item: InsertInvoiceItem): Promise<InvoiceItem>;
  updateInvoiceItem(item: UpdateInvoiceItem): Promise<InvoiceItem>;
  deleteInvoiceItem(id: number): Promise<void>;
  clearSessionItems(sessionId: string): Promise<void>;
  
  // Invoice Notes
  getInvoiceNotesBySession(sessionId: string): Promise<InvoiceNotes | undefined>;
  createOrUpdateInvoiceNotes(notes: InsertInvoiceNotes): Promise<InvoiceNotes>;
}

export class DatabaseStorage implements IStorage {
  async getInvoiceItemsBySession(sessionId: string): Promise<InvoiceItem[]> {
    return await db
      .select()
      .from(invoiceItems)
      .where(eq(invoiceItems.sessionId, sessionId));
  }

  async createInvoiceItem(insertItem: InsertInvoiceItem): Promise<InvoiceItem> {
    const [item] = await db
      .insert(invoiceItems)
      .values(insertItem)
      .returning();
    return item;
  }

  async updateInvoiceItem(updateItem: UpdateInvoiceItem): Promise<InvoiceItem> {
    const { id, ...updateData } = updateItem;
    const [item] = await db
      .update(invoiceItems)
      .set({
        ...updateData,
        updatedAt: new Date(),
      })
      .where(eq(invoiceItems.id, id))
      .returning();
    return item;
  }

  async deleteInvoiceItem(id: number): Promise<void> {
    await db.delete(invoiceItems).where(eq(invoiceItems.id, id));
  }

  async clearSessionItems(sessionId: string): Promise<void> {
    await db.delete(invoiceItems).where(eq(invoiceItems.sessionId, sessionId));
  }

  async getInvoiceNotesBySession(sessionId: string): Promise<InvoiceNotes | undefined> {
    const [notes] = await db
      .select()
      .from(invoiceNotes)
      .where(eq(invoiceNotes.sessionId, sessionId));
    return notes;
  }

  async createOrUpdateInvoiceNotes(insertNotes: InsertInvoiceNotes): Promise<InvoiceNotes> {
    const [notes] = await db
      .insert(invoiceNotes)
      .values(insertNotes)
      .onConflictDoUpdate({
        target: invoiceNotes.sessionId,
        set: {
          notes: insertNotes.notes,
          updatedAt: new Date(),
        },
      })
      .returning();
    return notes;
  }
}

export const storage = new DatabaseStorage();