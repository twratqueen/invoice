import { Request, Response, NextFunction } from "express";
import { authService } from "../services/authService";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        username: string;
        displayName: string;
        role: string;
      };
    }
  }
}

declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}

export async function authenticateToken(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.session.userId;

    if (!userId) {
      return res.status(401).json({ message: "請先登入" });
    }

    const user = await authService.getUserById(userId);
    if (!user || !user.isActive) {
      req.session.userId = undefined;
      return res.status(401).json({ message: "用戶不存在或已停用" });
    }

    req.user = {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
    };

    next();
  } catch (error) {
    console.error("Authentication error:", error);
    res.status(500).json({ message: "認證失敗" });
  }
}

export function requireRole(role: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: "請先登入" });
    }

    if (req.user.role !== role && req.user.role !== "admin") {
      return res.status(403).json({ message: "權限不足" });
    }

    next();
  };
}

export function requirePermission(action: string, resourceType: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: "請先登入" });
    }

    try {
      const hasPermission = await authService.checkPermission(req.user.id, action, resourceType);
      if (!hasPermission) {
        return res.status(403).json({ message: "權限不足" });
      }

      next();
    } catch (error) {
      console.error("Permission check error:", error);
      res.status(500).json({ message: "權限檢查失敗" });
    }
  };
}