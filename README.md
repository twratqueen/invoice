# 電子發票管理系統 v3.0

## 系統功能

### 核心功能
- ✅ 多用戶認證系統（管理員/操作員權限分級）
- ✅ 自動發票號碼管理（支援跨月開票20日規則）
- ✅ 國稅局批次上傳機制（可設定延遲上傳）
- ✅ 發票作廢功能（完整生命週期管理）
- ✅ 資料備份與匯出（會計師事務所專用格式）
- ✅ 年度營業額統計（防止超限警告系統）
- ✅ 審計日誌記錄（追蹤所有用戶操作）

### 測試帳號
- **管理員**：admin / admin123
- **操作員**：operator / operator123

## 安裝與運行

### 環境需求
- Node.js 18+
- PostgreSQL 資料庫

### 安裝步驟

1. 安裝依賴
```bash
npm install
```

2. 設定環境變數
```bash
# .env
DATABASE_URL=your_postgresql_connection_string
SESSION_SECRET=your_session_secret
```

3. 初始化資料庫
```bash
npm run db:push
npm run init-admin
```

4. 啟動開發伺服器
```bash
npm run dev
```

## 技術架構

- **前端**: React + TypeScript + Vite
- **後端**: Node.js + Express + TypeScript
- **資料庫**: PostgreSQL + Drizzle ORM
- **認證**: Express Session
- **UI**: Radix UI + Tailwind CSS

## 部署建議

### 免費部署方案
- **前端**: Vercel / Netlify
- **後端**: Railway / Render
- **資料庫**: Neon PostgreSQL

### 生產環境
1. 建置專案
```bash
npm run build
```

2. 啟動生產伺服器
```bash
npm start
```

## 授權
此專案為開源軟體，採用 MIT 授權。
