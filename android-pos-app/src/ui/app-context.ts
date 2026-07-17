import { createContext, useContext } from "react";
import type { LocalUser } from "../domain/models";
import type { OfflinePosApplication } from "../services/offline-app";

export type AppContextValue = {
  app: OfflinePosApplication;
  user: LocalUser;
  revision: number;
  refresh: () => void;
  setUnsaved: (unsaved: boolean) => void;
  notify: (message: string, tone?: "success" | "error") => void;
  inventoryFocusId: string | null;
  openInventoryProduct: (productId: string) => void;
  openCashDrawer: () => void;
  restartAfterFactoryReset: () => void;
  clearInventoryFocus: () => void;
};

export const AppContext = createContext<AppContextValue | null>(null);

export function useOfflineApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("App context is unavailable.");
  return context;
}
