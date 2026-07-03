import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import helmet from "helmet";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/error-handler.js";
import { requestLogger } from "./middleware/request-logger.js";
import { apiRateLimit } from "./middleware/rate-limit.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { healthRouter } from "./modules/health/health.routes.js";
import { inventoryRouter } from "./modules/inventory/inventory.routes.js";
import { productRouter } from "./modules/products/product.routes.js";
import { saleRouter } from "./modules/sales/sale.routes.js";
import { userRouter } from "./modules/users/user.routes.js";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(compression());
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());
  app.use(requestLogger);
  app.use(apiRateLimit);

  app.use("/api/health", healthRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/inventory", inventoryRouter);
  app.use("/api/products", productRouter);
  app.use("/api/sales", saleRouter);
  app.use("/api/users", userRouter);

  if (env.FRONTEND_DIST_DIR && fs.existsSync(env.FRONTEND_DIST_DIR)) {
    app.use(express.static(env.FRONTEND_DIST_DIR));
    app.get("*", (_request, response, next) => {
      const indexPath = path.join(env.FRONTEND_DIST_DIR as string, "index.html");
      if (!fs.existsSync(indexPath)) {
        next();
        return;
      }
      response.sendFile(indexPath);
    });
  }

  app.use(errorHandler);

  return app;
}
