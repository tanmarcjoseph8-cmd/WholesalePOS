import type http from "node:http";
import { Server } from "socket.io";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { subscribeRealtimeEvent } from "./bus.js";
import { realtimeEvents } from "./events.js";

export function createRealtimeServer(server: http.Server) {
  const io = new Server(server, {
    cors: {
      origin: env.CORS_ORIGIN,
      credentials: true
    }
  });

  io.on("connection", (socket) => {
    logger.info("Realtime client connected", { socketId: socket.id });
    socket.on("disconnect", (reason) => {
      logger.info("Realtime client disconnected", { socketId: socket.id, reason });
    });
  });

  for (const eventName of Object.values(realtimeEvents)) {
    subscribeRealtimeEvent(eventName, (payload) => {
      io.emit(eventName, payload);
    });
  }

  return io;
}
