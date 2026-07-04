import { io, type Socket } from "socket.io-client";
import type { QueryClient } from "@tanstack/react-query";
import { getApiBaseUrl } from "./api";

const stockRefreshEvents = ["sale:created", "inventory:adjusted", "inventory:received", "product:created", "product:updated", "price:changed"];

export async function refreshStockAwareViews(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["products"] }),
    queryClient.invalidateQueries({ queryKey: ["pos-products"] }),
    queryClient.invalidateQueries({ queryKey: ["stock"] }),
    queryClient.invalidateQueries({ queryKey: ["warehouses"] }),
    queryClient.invalidateQueries({ queryKey: ["inventory-movements"] }),
    queryClient.invalidateQueries({ queryKey: ["reports"] }),
    queryClient.invalidateQueries({ queryKey: ["notifications"] }),
    queryClient.invalidateQueries({ queryKey: ["api-health"] })
  ]);
}

export function connectRealtimeUpdates(queryClient: QueryClient) {
  const socket: Socket = io(getApiBaseUrl(), {
    transports: ["websocket", "polling"],
    withCredentials: true
  });

  for (const eventName of stockRefreshEvents) {
    socket.on(eventName, () => {
      void refreshStockAwareViews(queryClient);
    });
  }

  return () => {
    for (const eventName of stockRefreshEvents) {
      socket.off(eventName);
    }
    socket.disconnect();
  };
}
