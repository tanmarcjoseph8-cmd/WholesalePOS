import http from "node:http";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { createRealtimeServer } from "./realtime/socket.js";

const app = createApp();
const server = http.createServer(app);

createRealtimeServer(server);

server.listen(env.PORT, () => {
  logger.info("WholesalePOS API started", { port: env.PORT, environment: env.NODE_ENV });
});

const shutdown = (signal: string) => {
  logger.info("Shutting down API", { signal });
  server.close(() => process.exit(0));
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
