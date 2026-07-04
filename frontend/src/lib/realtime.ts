import { io, type Socket } from "socket.io-client";
import type { QueryClient } from "@tanstack/react-query";
import { getApiBaseUrl } from "./api";

const stockRefreshEvents = ["sale:created", "inventory:adjusted", "inventory:received", "product:created", "product:updated", "price:changed"];

function refreshStockAwareViews(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ["products"] });
  void queryClient.invalidateQueries({ queryKey: ["pos-products"] });
  void queryClient.invalidateQueries({ queryKey: ["stock"] });
  void queryClient.invalidateQueries({ queryKey: ["inventory-movements"] });
  void queryClient.invalidateQueries({ queryKey: ["reports"] });
  void queryClient.invalidateQueries({ queryKey: ["notifications"] });
}

export function connectRealtimeUpdates(queryClient: QueryClient) {
  const socket: Socket = io(getApiBaseUrl(), {
    transports: ["websocket", "polling"],
    withCredentials: true
  });

  for (const eventName of stockRefreshEvents) {
    socket.on(eventName, () => refreshStockAwareViews(queryClient));
  }

  return () => {
    for (const eventName of stockRefreshEvents) {
      socket.off(eventName);
    }
    socket.disconnect();
  };
}
