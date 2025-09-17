import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import cookieParser from "cookie-parser";

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.use((req, _res, next) => {
  const start = Date.now();
  const originalSend = _res.send;
  _res.send = function (body) {
    const duration = Date.now() - start;
    log(`${req.method} ${req.path} ${_res.statusCode} in ${duration}ms`);
    return originalSend.call(this, body);
  };
  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    
    console.error(`Error ${status}: ${message}`);
    res.status(status).json({ message });
  });

  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const PORT = 5000;
  server.listen(PORT, "0.0.0.0", () => {
    log(`serving on port ${PORT}`);
  });
})();