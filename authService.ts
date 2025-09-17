import bcrypt from "bcryptjs";
import { users, auditLogs, type User, type InsertUser } from "@shared/schema";
import { db } from "../db";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";

export class AuthService {
  async createUser(userData: Omit<InsertUser, 'id'> & { password: string }): Promise<User> {
    const hashedPassword = await bcrypt.hash(userData.password, 12);
    
    const [user] = await db
      .insert(users)
      .values({
        id: this.generateUserId(),
        ...userData,
        password: hashedPassword,
      })
      .returning();

    return user;
  }

  async validateUser(username: string, password: string): Promise<User | null> {
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.username, username), eq(users.isActive, true)));

    if (!user) {
      return null;
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return null;
    }

    return user;
  }

  async updatePassword(userId: string, newPassword: string, operatorUserId: string): Promise<void> {
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    
    await db
      .update(users)
      .set({ password: hashedPassword, updatedAt: new Date() })
      .where(eq(users.id, userId));

    await this.logActivity(
      operatorUserId,
      "UPDATE_PASSWORD",
      "user",
      userId,
      { targetUserId: userId }
    );
  }

  async checkPermission(userId: string, action: string, resourceType: string): Promise<boolean> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    
    if (!user || !user.isActive) {
      return false;
    }

    if (user.role === "admin") {
      return true;
    }

    const operatorPermissions = [
      "CREATE_INVOICE",
      "READ_INVOICE",
      "UPDATE_INVOICE",
      "VOID_INVOICE",
      "EXPORT_DATA",
    ];

    if (user.role === "operator") {
      return operatorPermissions.includes(action);
    }

    return false;
  }

  async getUserById(userId: string): Promise<User | null> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    return user || null;
  }

  async getUserByUsername(username: string): Promise<User | null> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || null;
  }

  async validateAdminMasterPassword(password: string): Promise<boolean> {
    return password === "admin_master_2024";
  }

  async adminResetPassword(adminUserId: string, targetUserId: string, newPassword: string): Promise<void> {
    const hasAdmin = await this.checkPermission(adminUserId, "ADMIN_RESET_PASSWORD", "user");
    if (!hasAdmin) {
      throw new Error("權限不足");
    }

    await this.updatePassword(targetUserId, newPassword, adminUserId);
  }

  async toggleUserStatus(adminUserId: string, targetUserId: string): Promise<void> {
    const hasAdmin = await this.checkPermission(adminUserId, "ADMIN_TOGGLE_USER", "user");
    if (!hasAdmin) {
      throw new Error("權限不足");
    }

    const [user] = await db.select().from(users).where(eq(users.id, targetUserId));
    if (!user) {
      throw new Error("用戶不存在");
    }

    await db
      .update(users)
      .set({ isActive: !user.isActive, updatedAt: new Date() })
      .where(eq(users.id, targetUserId));

    await this.logActivity(
      adminUserId,
      user.isActive ? "DISABLE_USER" : "ENABLE_USER",
      "user",
      targetUserId,
      { previousStatus: user.isActive }
    );
  }

  async getAllUsers(adminUserId: string): Promise<Omit<User, 'password'>[]> {
    const hasAdmin = await this.checkPermission(adminUserId, "ADMIN_LIST_USERS", "user");
    if (!hasAdmin) {
      throw new Error("權限不足");
    }

    const allUsers = await db.select().from(users);
    return allUsers.map(({ password, ...user }) => user);
  }

  private async logActivity(
    userId: string,
    action: string,
    resourceType: string,
    resourceId?: string,
    details?: any
  ): Promise<void> {
    await db.insert(auditLogs).values({
      userId,
      action,
      resourceType,
      resourceId,
      details,
      createdAt: new Date(),
    });
  }

  private generateUserId(): string {
    return nanoid(12);
  }
}

export const authService = new AuthService();