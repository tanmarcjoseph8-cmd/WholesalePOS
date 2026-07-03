import type { RequestHandler } from "express";
import { logger } from "../config/logger.js";

export const requestLogger: RequestHandler = (request, response, next) => {
  const startedAt = performance.now();
  response.on("finish", () => {
    logger.info("HTTP request completed", {
      method: request.method,
      path: request.originalUrl,
      statusCode: response.statusCode,
      durationMs: Math.round(performance.now() - startedAt)
    });
  });
  next();
};
