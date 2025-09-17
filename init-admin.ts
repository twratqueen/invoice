import { authService } from "../server/services/authService";
import "../server/db";

async function initializeAdmin() {
  try {
    console.log("正在初始化管理員帳號...");
    
    const existingAdmin = await authService.getUserByUsername("admin");
    if (existingAdmin) {
      console.log("管理員帳號已存在");
      return;
    }

    await authService.createUser({
      username: "admin",
      password: "admin123",
      displayName: "系統管理員",
      role: "admin",
      isActive: true,
    });

    console.log("管理員帳號創建成功：");
    console.log("用戶名：admin");
    console.log("密碼：admin123");

    // 創建測試操作員
    const existingOperator = await authService.getUserByUsername("operator");
    if (!existingOperator) {
      await authService.createUser({
        username: "operator",
        password: "operator123",
        displayName: "測試操作員",
        role: "operator",
        isActive: true,
      });
      
      console.log("操作員帳號創建成功：");
      console.log("用戶名：operator");
      console.log("密碼：operator123");
    }

  } catch (error) {
    console.error("初始化失敗：", error);
  }
}

if (require.main === module) {
  initializeAdmin()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}