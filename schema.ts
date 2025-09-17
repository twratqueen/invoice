import {
  pgTable,
  text,
  varchar,
  timestamp,
  jsonb,
  index,
  integer,
  decimal,
  boolean,
  serial,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table (required for authentication)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// Users table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().notNull(),
  username: varchar("username").unique().notNull(),
  password: varchar("password").notNull(),
  displayName: varchar("display_name").notNull(),
  role: varchar("role").notNull().default("operator"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Invoice numbers table
export const invoiceNumbers = pgTable("invoice_numbers", {
  id: serial("id").primaryKey(),
  yearMonth: varchar("year_month").notNull(),
  prefix: varchar("prefix").notNull(),
  startNumber: integer("start_number").notNull(),
  endNumber: integer("end_number").notNull(),
  currentNumber: integer("current_number").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  downloadedAt: timestamp("downloaded_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Invoices table
export const invoices = pgTable("invoices", {
  id: serial("id").primaryKey(),
  invoiceNumber: varchar("invoice_number").unique().notNull(),
  yearMonth: varchar("year_month").notNull(),
  buyerName: varchar("buyer_name").notNull(),
  notes: text("notes"),
  preTaxTotal: decimal("pre_tax_total", { precision: 10, scale: 2 }).notNull(),
  taxTotal: decimal("tax_total", { precision: 10, scale: 2 }).notNull(),
  grandTotal: decimal("grand_total", { precision: 10, scale: 2 }).notNull(),
  status: varchar("status").notNull().default("draft"),
  userId: varchar("user_id").notNull(),
  issuedAt: timestamp("issued_at").defaultNow(),
  voidedAt: timestamp("voided_at"),
  voidReason: text("void_reason"),
  uploadedAt: timestamp("uploaded_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Invoice items table
export const invoiceItems = pgTable("invoice_items", {
  id: serial("id").primaryKey(),
  sessionId: varchar("session_id").notNull(),
  invoiceId: integer("invoice_id"),
  description: text("description").notNull(),
  category: varchar("category").notNull(),
  preTaxAmount: decimal("pre_tax_amount", { precision: 10, scale: 2 }).notNull(),
  taxAmount: decimal("tax_amount", { precision: 10, scale: 2 }).notNull(),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Invoice notes table
export const invoiceNotes = pgTable("invoice_notes", {
  id: serial("id").primaryKey(),
  sessionId: varchar("session_id").unique().notNull(),
  notes: text("notes").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Audit logs table
export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  action: varchar("action").notNull(),
  resourceType: varchar("resource_type").notNull(),
  resourceId: varchar("resource_id"),
  details: jsonb("details"),
  ipAddress: varchar("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Annual statistics table
export const annualStats = pgTable("annual_stats", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  year: integer("year").notNull(),
  totalRevenue: decimal("total_revenue", { precision: 15, scale: 2 }).notNull().default("0"),
  totalInvoices: integer("total_invoices").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// System settings table
export const systemSettings = pgTable("system_settings", {
  id: serial("id").primaryKey(),
  key: varchar("key").unique().notNull(),
  value: text("value").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Zod schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertInvoiceSchema = createInsertSchema(invoices).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertInvoiceNumberSchema = createInsertSchema(invoiceNumbers).omit({
  id: true,
  createdAt: true,
});

export const insertInvoiceItemSchema = createInsertSchema(invoiceItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertInvoiceNotesSchema = createInsertSchema(invoiceNotes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({
  id: true,
  createdAt: true,
});

export const updateInvoiceItemSchema = insertInvoiceItemSchema.partial().extend({
  id: z.number(),
});

export const updateInvoiceSchema = insertInvoiceSchema.partial().extend({
  id: z.number(),
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type UpsertUser = typeof users.$inferInsert;

export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type UpdateInvoice = z.infer<typeof updateInvoiceSchema>;

export type InvoiceNumber = typeof invoiceNumbers.$inferSelect;
export type InsertInvoiceNumber = z.infer<typeof insertInvoiceNumberSchema>;

export type InvoiceItem = typeof invoiceItems.$inferSelect;
export type InsertInvoiceItem = z.infer<typeof insertInvoiceItemSchema>;
export type UpdateInvoiceItem = z.infer<typeof updateInvoiceItemSchema>;

export type InvoiceNotes = typeof invoiceNotes.$inferSelect;
export type InsertInvoiceNotes = z.infer<typeof insertInvoiceNotesSchema>;

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;

export type AnnualStats = typeof annualStats.$inferSelect;
export type SystemSettings = typeof systemSettings.$inferSelect;

// Constants
export const categoryOptions = [
  { label: "廣告帆布", value: "廣告帆布" },
  { label: "廣告費", value: "廣告費" },
  { label: "廣告租金", value: "廣告租金" },
  { label: "設計費", value: "設計費" },
  { label: "製作費", value: "製作費" },
  { label: "安裝費", value: "安裝費" },
  { label: "維護費", value: "維護費" },
  { label: "其他", value: "其他" },
] as const;

export const companyOptions = [
  {
    id: "company1",
    name: "廣告設計有限公司",
    taxId: "12345678",
    address: "台北市信義區信義路五段7號",
    phone: "02-2345-6789",
  },
  {
    id: "company2", 
    name: "創意行銷股份有限公司",
    taxId: "87654321",
    address: "台中市西屯區台灣大道三段99號",
    phone: "04-2345-6789",
  },
] as const;

export type CategoryType = typeof categoryOptions[number]["value"];
export type CompanyType = typeof companyOptions[number]["id"];