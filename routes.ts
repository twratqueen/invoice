import type { Express } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";
import { authService } from "./services/authService";
import { invoiceService } from "./services/invoiceService";
import { invoiceNumberService } from "./services/invoiceNumberService";
import { authenticateToken, requireRole, requirePermission } from "./middleware/auth";
import multer from "multer";
import { insertInvoiceItemSchema, insertInvoiceNotesSchema } from "@shared/schema";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Session configuration
  const pgStore = connectPg(session);
  app.use(session({
    store: new pgStore({
      conString: process.env.DATABASE_URL,
      tableName: 'sessions',
      createTableIfMissing: false,
    }),
    secret: process.env.SESSION_SECRET || 'fallback-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false,
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
    }
  }));

  // Auth routes
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({ message: "請提供用戶名和密碼" });
      }

      const user = await authService.validateUser(username, password);
      if (!user) {
        return res.status(401).json({ message: "用戶名或密碼錯誤" });
      }

      req.session.userId = user.id;
      
      res.json({
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "登入失敗" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "登出失敗" });
      }
      res.json({ message: "登出成功" });
    });
  });

  app.get("/api/auth/user", authenticateToken, (req, res) => {
    res.json(req.user);
  });

  // Invoice items routes
  app.get("/api/invoice-items/:sessionId", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const items = await storage.getInvoiceItemsBySession(sessionId);
      res.json(items);
    } catch (error) {
      console.error("Error fetching invoice items:", error);
      res.status(500).json({ message: "無法獲取發票項目" });
    }
  });

  app.post("/api/invoice-items", async (req, res) => {
    try {
      const validatedData = insertInvoiceItemSchema.parse(req.body);
      const item = await storage.createInvoiceItem(validatedData);
      res.json(item);
    } catch (error) {
      console.error("Error creating invoice item:", error);
      res.status(500).json({ message: "無法創建發票項目" });
    }
  });

  app.patch("/api/invoice-items/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updateData = { id, ...req.body };
      const item = await storage.updateInvoiceItem(updateData);
      res.json(item);
    } catch (error) {
      console.error("Error updating invoice item:", error);
      res.status(500).json({ message: "無法更新發票項目" });
    }
  });

  app.delete("/api/invoice-items/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteInvoiceItem(id);
      res.json({ message: "項目已刪除" });
    } catch (error) {
      console.error("Error deleting invoice item:", error);
      res.status(500).json({ message: "無法刪除發票項目" });
    }
  });

  // Invoice notes routes
  app.get("/api/invoice-notes/:sessionId", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const notes = await storage.getInvoiceNotesBySession(sessionId);
      res.json(notes);
    } catch (error) {
      console.error("Error fetching invoice notes:", error);
      res.status(500).json({ message: "無法獲取發票備註" });
    }
  });

  app.post("/api/invoice-notes", async (req, res) => {
    try {
      const validatedData = insertInvoiceNotesSchema.parse(req.body);
      const notes = await storage.createOrUpdateInvoiceNotes(validatedData);
      res.json(notes);
    } catch (error) {
      console.error("Error creating/updating invoice notes:", error);
      res.status(500).json({ message: "無法保存發票備註" });
    }
  });

  // Excel upload route
  app.post("/api/upload-excel", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "請選擇檔案" });
      }

      const XLSX = await import("xlsx");
      const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
      
      const sheets = workbook.SheetNames.map((name, index) => {
        const worksheet = workbook.Sheets[name];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        const hasData = jsonData.length > 1;
        const preview = hasData ? jsonData.slice(1, 6).map((row: any) => ({
          description: row[0] || "",
          amount: row[1] || "",
        })) : [];

        return {
          name,
          index,
          rowCount: jsonData.length - 1,
          hasData,
          preview,
        };
      });

      res.json({ sheets });
    } catch (error) {
      console.error("Excel upload error:", error);
      res.status(500).json({ message: "檔案解析失敗" });
    }
  });

  // Parse excel sheet
  app.post("/api/parse-excel-sheet", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "請選擇檔案" });
      }

      const { sheetIndex, sessionId } = req.body;
      
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
      const sheetName = workbook.SheetNames[parseInt(sheetIndex)];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      const items = jsonData.slice(1).map((row: any) => {
        const description = String(row[0] || "").trim();
        const amountStr = String(row[1] || "").replace(/,/g, "");
        const amount = parseFloat(amountStr) || 0;

        if (!description || amount <= 0) return null;

        const preTaxAmount = Math.round((amount * 20) / 21);
        const taxAmount = amount - preTaxAmount;

        return {
          sessionId,
          description,
          category: "其他",
          preTaxAmount,
          taxAmount,
          totalAmount: amount,
        };
      }).filter(Boolean);

      res.json({ items });
    } catch (error) {
      console.error("Excel parsing error:", error);
      res.status(500).json({ message: "檔案解析失敗" });
    }
  });

  // Invoice management routes (protected)
  app.post("/api/invoices", 
    authenticateToken, 
    requirePermission("CREATE_INVOICE", "invoice"), 
    async (req, res) => {
      try {
        const { invoiceData, items } = req.body;
        const invoice = await invoiceService.createInvoice(invoiceData, items, req.user!.id);
        res.json(invoice);
      } catch (error) {
        console.error("Error creating invoice:", error);
        res.status(500).json({ message: "無法創建發票" });
      }
    }
  );

  app.get("/api/invoices", authenticateToken, async (req, res) => {
    try {
      const { yearMonth, status, limit, offset } = req.query;
      const invoices = await invoiceService.getUserInvoices(req.user!.id, {
        yearMonth: yearMonth as string,
        status: status as string,
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined,
      });
      res.json(invoices);
    } catch (error) {
      console.error("Error fetching invoices:", error);
      res.status(500).json({ message: "無法獲取發票列表" });
    }
  });

  app.post("/api/invoices/:id/void", 
    authenticateToken, 
    requirePermission("VOID_INVOICE", "invoice"), 
    async (req, res) => {
      try {
        const invoiceId = parseInt(req.params.id);
        const { reason } = req.body;
        await invoiceService.voidInvoice(invoiceId, reason, req.user!.id);
        res.json({ message: "發票已作廢" });
      } catch (error) {
        console.error("Error voiding invoice:", error);
        res.status(500).json({ message: "無法作廢發票" });
      }
    }
  );

  app.post("/api/invoices/batch-upload", 
    authenticateToken, 
    requirePermission("UPLOAD_INVOICE", "invoice"), 
    async (req, res) => {
      try {
        const { yearMonth } = req.body;
        const result = await invoiceService.batchUploadInvoices(yearMonth, req.user!.id);
        res.json(result);
      } catch (error) {
        console.error("Error batch uploading invoices:", error);
        res.status(500).json({ message: "批次上傳失敗" });
      }
    }
  );

  // Statistics routes
  app.get("/api/stats/annual/:year", authenticateToken, async (req, res) => {
    try {
      const year = parseInt(req.params.year);
      const stats = await invoiceService.getAnnualStats(year, req.user!.id);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching annual stats:", error);
      res.status(500).json({ message: "無法獲取年度統計" });
    }
  });

  // Admin routes
  app.get("/api/admin/users", 
    authenticateToken, 
    requireRole("admin"), 
    async (req, res) => {
      try {
        const users = await authService.getAllUsers(req.user!.id);
        res.json(users);
      } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).json({ message: "無法獲取用戶列表" });
      }
    }
  );

  app.post("/api/admin/users/:id/toggle", 
    authenticateToken, 
    requireRole("admin"), 
    async (req, res) => {
      try {
        const targetUserId = req.params.id;
        await authService.toggleUserStatus(req.user!.id, targetUserId);
        res.json({ message: "用戶狀態已更新" });
      } catch (error) {
        console.error("Error toggling user status:", error);
        res.status(500).json({ message: "無法更新用戶狀態" });
      }
    }
  );

  app.post("/api/admin/users/:id/reset-password", 
    authenticateToken, 
    requireRole("admin"), 
    async (req, res) => {
      try {
        const targetUserId = req.params.id;
        const { newPassword } = req.body;
        await authService.adminResetPassword(req.user!.id, targetUserId, newPassword);
        res.json({ message: "密碼已重設" });
      } catch (error) {
        console.error("Error resetting password:", error);
        res.status(500).json({ message: "無法重設密碼" });
      }
    }
  );

  // Export routes
  app.get("/api/export/accounting/:yearMonth", 
    authenticateToken, 
    requirePermission("EXPORT_DATA", "invoice"), 
    async (req, res) => {
      try {
        const yearMonth = req.params.yearMonth;
        const format = req.query.format as 'csv' | 'excel' || 'csv';
        const data = await invoiceService.exportAccountingData(yearMonth, format);
        res.json({ data });
      } catch (error) {
        console.error("Error exporting data:", error);
        res.status(500).json({ message: "資料匯出失敗" });
      }
    }
  );

  const httpServer = createServer(app);
  return httpServer;
}