import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { BarChart3, Bell, BellRing, Boxes, ClipboardList, LayoutDashboard, LogOut, RefreshCw, Settings, ShoppingCart, Store, Utensils, WalletCards } from "lucide-react";
import type { AppSettings, LocalUser } from "../domain/models";
import { inventoryAlertMessage } from "../domain/inventory-alerts";
import { lifecycleService } from "../platform/lifecycle";
import { offlineApp } from "../services/offline-app";
import { AppContext } from "./app-context";
import { AuthScreen } from "./AuthScreen";
import { ConfirmDialog } from "./ConfirmDialog";

const DashboardView = lazy(() => import("./views/DashboardView").then((module) => ({ default: module.DashboardView })));
const InventoryView = lazy(() => import("./views/InventoryView").then((module) => ({ default: module.InventoryView })));
const PosView = lazy(() => import("./views/PosView").then((module) => ({ default: module.PosView })));
const RestaurantView = lazy(() => import("./views/RestaurantView").then((module) => ({ default: module.RestaurantView })));
const SalesHistoryView = lazy(() => import("./views/SalesHistoryView").then((module) => ({ default: module.SalesHistoryView })));
const SettingsView = lazy(() => import("./views/SettingsView").then((module) => ({ default: module.SettingsView })));
const ReportsView = lazy(() => import("./views/ReportsView").then((module) => ({ default: module.ReportsView })));
const AlertsView = lazy(() => import("./views/AlertsView").then((module) => ({ default: module.AlertsView })));
const CashDrawerView = lazy(() => import("./views/CashDrawerView").then((module) => ({ default: module.CashDrawerView })));

type ViewId = "dashboard" | "pos" | "restaurant" | "cash-drawer" | "inventory" | "sales" | "reports" | "alerts" | "settings";
type Toast = { id: number; message: string; tone: "success" | "error" };

const views = [
  { id: "dashboard" as const, label: "Dashboard", icon: LayoutDashboard },
  { id: "pos" as const, label: "POS", icon: ShoppingCart },
  { id: "restaurant" as const, label: "Restaurant", icon: Utensils },
  { id: "cash-drawer" as const, label: "Cash Drawer", icon: WalletCards, permission: "cash_drawer.use" },
  { id: "inventory" as const, label: "Inventory", icon: Boxes, permission: "inventory.view" },
  { id: "sales" as const, label: "Sales", icon: BarChart3 },
  { id: "reports" as const, label: "Reports", icon: ClipboardList, permission: "reports.view" },
  { id: "alerts" as const, label: "Alerts", icon: BellRing, permission: "inventory.view" },
  { id: "settings" as const, label: "Settings", icon: Settings, permission: "settings.manage" }
];

export function App() {
  const [bootState, setBootState] = useState<"booting" | "ready" | "error">("booting");
  const [bootError, setBootError] = useState("");
  const [requiresSetup, setRequiresSetup] = useState(false);
  const [user, setUser] = useState<LocalUser | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [view, setView] = useState<ViewId>("dashboard");
  const [revision, setRevision] = useState(0);
  const [toast, setToast] = useState<Toast | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const [inventoryFocusId, setInventoryFocusId] = useState<string | null>(null);
  const [pendingAlertId, setPendingAlertId] = useState<string | null>(null);
  const unsavedRef = useRef(false);
  const pendingView = useRef<ViewId | null>(null);

  useEffect(() => {
    let active = true;
    void offlineApp.initialize().then(async () => {
      const [setup, loadedSettings] = await Promise.all([offlineApp.auth.requiresSetup(), offlineApp.settingsReports.getSettings()]);
      if (!active) return;
      setRequiresSetup(setup); setSettings(loadedSettings); document.documentElement.dataset.theme = loadedSettings.darkMode ? "dark" : "light"; setBootState("ready");
    }).catch((error: unknown) => { if (active) { setBootError(error instanceof Error ? error.message : "The local database could not start."); setBootState("error"); } });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (bootState !== "ready") return;
    void offlineApp.settingsReports.getSettings().then((loadedSettings) => {
      setSettings(loadedSettings);
      document.documentElement.dataset.theme = loadedSettings.darkMode ? "dark" : "light";
    });
  }, [bootState, revision]);

  useEffect(() => {
    if (bootState !== "ready") return;
    void lifecycleService.register({ hasUnsavedWork: () => unsavedRef.current, onResume: () => setRevision((value) => value + 1), onPause: () => undefined, onBackAtRoot: () => void CapacitorApp.exitApp() });
    const confirmLeave = () => setLeaveOpen(true);
    const openInventoryAlert = (event: Event) => {
      const detail = (event as CustomEvent<{ productId?: string; alertId?: string }>).detail;
      const canViewInventory = Boolean(user && (user.permissions.includes("*") || user.permissions.includes("inventory.view") || user.permissions.includes("inventory.manage")));
      if (detail?.productId && canViewInventory) { setInventoryFocusId(detail.productId); setPendingAlertId(detail.alertId ?? null); setView("inventory"); }
    };
    const alertsCreated = (event: Event) => {
      const alerts = (event as CustomEvent<{ alerts?: Parameters<typeof inventoryAlertMessage>[0] }>).detail.alerts ?? [];
      setRevision((value) => value + 1);
      const message = inventoryAlertMessage(alerts);
      if (message) notify(message, "error");
    };
    window.addEventListener("pos:confirm-leave", confirmLeave);
    window.addEventListener("pos:open-inventory-alert", openInventoryAlert);
    window.addEventListener("pos:inventory-alerts-created", alertsCreated);
    const pendingTarget = user ? offlineApp.inventoryNotifications.consumePendingTarget() : null;
    const canViewInventory = Boolean(user && (user.permissions.includes("*") || user.permissions.includes("inventory.view") || user.permissions.includes("inventory.manage")));
    if (pendingTarget && canViewInventory) { setInventoryFocusId(pendingTarget.productId); setPendingAlertId(pendingTarget.alertId ?? null); setView("inventory"); }
    return () => { window.removeEventListener("pos:confirm-leave", confirmLeave); window.removeEventListener("pos:open-inventory-alert", openInventoryAlert); window.removeEventListener("pos:inventory-alerts-created", alertsCreated); void lifecycleService.removeAll(); };
  }, [bootState, user]);

  useEffect(() => {
    if (!user || !settings) { setUnreadAlerts(0); return; }
    const canViewInventory = user.permissions.includes("*") || user.permissions.includes("inventory.view") || user.permissions.includes("inventory.manage");
    if (!canViewInventory) return;
    void offlineApp.inventoryAlerts.unreadCount(user).then(setUnreadAlerts).catch(() => setUnreadAlerts(0));
    void offlineApp.inventoryNotifications.activate(settings).then(() => offlineApp.inventoryAlerts.publishPendingSystemNotifications());
  }, [user, settings, revision]);

  useEffect(() => {
    if (!user || !pendingAlertId) return;
    void offlineApp.inventoryAlerts.markRead(user, pendingAlertId).then(() => { setPendingAlertId(null); setRevision((value) => value + 1); }).catch(() => setPendingAlertId(null));
  }, [user, pendingAlertId]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), toast.tone === "error" ? 6500 : 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function notify(message: string, tone: "success" | "error" = "success") { setToast({ id: Date.now(), message, tone }); }
  function setUnsaved(unsaved: boolean) { unsavedRef.current = unsaved; }
  function refresh() { setRevision((value) => value + 1); }
  function navigate(next: ViewId) { if (next === view) return; if (unsavedRef.current) { pendingView.current = next; setLeaveOpen(true); } else setView(next); }
  function discardAndLeave() { unsavedRef.current = false; setLeaveOpen(false); if (pendingView.current) { setView(pendingView.current); pendingView.current = null; } }
  function openInventoryProduct(productId: string) {
    if (!user || (!user.permissions.includes("*") && !user.permissions.includes("inventory.view") && !user.permissions.includes("inventory.manage"))) { notify("Inventory access is restricted for this account.", "error"); return; }
    unsavedRef.current = false; setInventoryFocusId(productId); setView("inventory");
  }

  if (bootState === "booting") return <main className="boot-page"><RefreshCw className="spin" size={32} /><strong>Opening secure local database</strong></main>;
  if (bootState === "error") return <main className="boot-page error"><DatabaseError /><h1>WholesalePOS could not start</h1><p>{bootError}</p><button className="button primary" onClick={() => window.location.reload()}>Try again</button></main>;
  if (!user) return <AuthScreen app={offlineApp} requiresSetup={requiresSetup} onAuthenticated={(authenticated) => { setUser(authenticated); setRequiresSetup(false); void offlineApp.inventoryAlerts.reconcileAndNotify(); }} />;

  const allowedViews = views.filter((entry) => {
    if (settings?.businessMode === "RETAIL" && entry.id === "restaurant") return false;
    if (!("permission" in entry) || !entry.permission) return true;
    if (user.permissions.includes("*") || user.permissions.includes(entry.permission)) return true;
    if (entry.permission === "cash_drawer.use" && user.permissions.includes("cash_drawer.manage")) return true;
    return entry.permission === "inventory.view" && user.permissions.includes("inventory.manage");
  });
  const effectiveView = allowedViews.some((entry) => entry.id === view) ? view : "dashboard";
  const CurrentView = effectiveView === "dashboard" ? DashboardView : effectiveView === "pos" ? PosView : effectiveView === "restaurant" ? RestaurantView : effectiveView === "cash-drawer" ? CashDrawerView : effectiveView === "inventory" ? InventoryView : effectiveView === "sales" ? SalesHistoryView : effectiveView === "reports" ? ReportsView : effectiveView === "alerts" ? AlertsView : SettingsView;

  return (
    <AppContext.Provider value={{ app: offlineApp, user, revision, refresh, setUnsaved, notify, inventoryFocusId, openInventoryProduct, openCashDrawer: () => navigate("cash-drawer"), clearInventoryFocus: () => setInventoryFocusId(null) }}>
      <div className="app-shell">
        <aside className="sidebar" aria-label="Application navigation"><div className="brand"><div className="brand-symbol"><Store size={21} /></div><div><strong>{settings?.businessName ?? "WholesalePOS"}</strong><span>Offline Android</span></div></div><nav aria-label="Main screens">{allowedViews.map(({ id, label, icon: Icon }) => <button type="button" className={effectiveView === id ? "active" : ""} aria-current={effectiveView === id ? "page" : undefined} key={id} onClick={() => navigate(id)} title={label}><Icon size={21} /><span>{label}</span>{id === "alerts" && unreadAlerts > 0 ? <b className="nav-badge">{unreadAlerts > 99 ? "99+" : unreadAlerts}</b> : null}</button>)}</nav><div className="account"><div className="account-avatar" aria-hidden="true">{user.name.trim().charAt(0).toUpperCase()}</div><div><strong>{user.name}</strong><span>{user.role}</span></div><button type="button" aria-label="Lock tablet" title="Lock tablet" onClick={() => { unsavedRef.current = false; setUser(null); setView("dashboard"); }}><LogOut size={20} /></button></div></aside>
        <header className="mobile-header"><div className="brand-symbol"><Store size={20} /></div><strong>{settings?.businessName ?? "WholesalePOS"}</strong>{allowedViews.some((entry) => entry.id === "alerts") ? <button type="button" className="mobile-alert-button" aria-label={`${unreadAlerts} unread inventory alerts`} onClick={() => navigate("alerts")}><Bell size={20} />{unreadAlerts > 0 ? <b>{unreadAlerts > 99 ? "99+" : unreadAlerts}</b> : null}</button> : null}<button type="button" aria-label="Refresh local data" onClick={refresh}><RefreshCw size={20} /></button></header>
        <main className="app-content"><Suspense fallback={<p className="loading" role="status">Opening local screen...</p>}><CurrentView /></Suspense></main>
        <nav className="bottom-nav" aria-label="Main screens">{allowedViews.map(({ id, label, icon: Icon }) => <button type="button" className={effectiveView === id ? "active" : ""} aria-current={effectiveView === id ? "page" : undefined} key={id} onClick={() => navigate(id)}><Icon size={20} /><span>{label}</span>{id === "alerts" && unreadAlerts > 0 ? <b className="nav-badge">{unreadAlerts > 99 ? "99+" : unreadAlerts}</b> : null}</button>)}</nav>
        {toast ? <div className={`toast ${toast.tone}`} role="status" key={toast.id}>{toast.message}</div> : null}
        <ConfirmDialog open={leaveOpen} title="Discard unsaved changes?" confirmLabel="Discard changes" destructive onClose={() => { pendingView.current = null; setLeaveOpen(false); }} onConfirm={discardAndLeave}><p>Your saved database records are safe. Only the changes currently shown on this screen will be discarded.</p></ConfirmDialog>
      </div>
    </AppContext.Provider>
  );
}

function DatabaseError() { return <Boxes size={40} />; }
