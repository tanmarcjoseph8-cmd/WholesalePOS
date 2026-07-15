import { App as CapacitorApp } from "@capacitor/app";
import type { PluginListenerHandle } from "@capacitor/core";

export class LifecycleService {
  private handles: PluginListenerHandle[] = [];

  async register(input: { hasUnsavedWork: () => boolean; onResume: () => void; onPause: () => void; onBackAtRoot: () => void }) {
    this.handles.push(await CapacitorApp.addListener("appStateChange", ({ isActive }) => {
      if (isActive) input.onResume();
      else input.onPause();
    }));
    this.handles.push(await CapacitorApp.addListener("backButton", ({ canGoBack }) => {
      if (input.hasUnsavedWork()) {
        window.dispatchEvent(new CustomEvent("pos:confirm-leave"));
        return;
      }
      if (canGoBack) window.history.back();
      else input.onBackAtRoot();
    }));
  }

  async removeAll() {
    await Promise.all(this.handles.map((handle) => handle.remove()));
    this.handles = [];
  }
}

export const lifecycleService = new LifecycleService();
