import { io, type Socket } from "socket.io-client";
import type { QueryClient } from "@tanstack/react-query";
import { getApiBaseUrl } from "./api";

const stockRefreshEvents = ["sale:created", "inventory:adjusted", "inventory:received", "product:created", "product:updated", "price:changed"];

export async function refreshStockAwareViews(queryClient: QueryClient) {
  const refetchType = "all" as const;
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["products"], refetchType }),
    queryClient.invalidateQueries({ queryKey: ["pos-products"], refetchType }),
    queryClient.invalidateQueries({ queryKey: ["stock"], refetchType }),
    queryClient.invalidateQueries({ queryKey: ["warehouses"], refetchType }),
    queryClient.invalidateQueries({ queryKey: ["inventory-movements"], refetchType }),
    queryClient.invalidateQueries({ queryKey: ["reports"], refetchType }),
    queryClient.invalidateQueries({ queryKey: ["restaurant"], refetchType }),
    queryClient.invalidateQueries({ queryKey: ["notifications"], refetchType }),
    queryClient.invalidateQueries({ queryKey: ["api-health"], refetchType })
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

  socket.on("restaurant:changed", () => {
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: ["restaurant"], refetchType: "all" }),
      queryClient.invalidateQueries({ queryKey: ["runtime-settings"], refetchType: "all" })
    ]);
  });

  return () => {
    for (const eventName of stockRefreshEvents) {
      socket.off(eventName);
    }
    socket.off("restaurant:changed");
    socket.disconnect();
  };
}
