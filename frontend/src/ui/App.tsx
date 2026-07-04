import { Bell, Boxes, ChartNoAxesCombined, Moon, ReceiptText, RefreshCw, Search, Settings, Sun, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DashboardPage } from "../views/DashboardPage";
import { PosPage } from "../views/PosPage";
import { InventoryPage } from "../views/InventoryPage";
import { ReportsPage } from "../views/ReportsPage";
import { SettingsPage } from "../views/SettingsPage";
import { UsersPage } from "../views/UsersPage";
import { useApiHealth } from "../lib/useApiHealth";
import { connectRealtimeUpdates, refreshStockAwareViews } from "../lib/realtime";
import {
  clearSession,
  fetchCurrentUser,
  fetchSetupStatus,
  fetchStock,
  loadSession,
  login,
  saveSession,
  setupOwner,
  verifyPassword,
  type AuthSession
} from "../lib/api";

const navItems = [
  { to: "/", label: "Dashboard", icon: ChartNoAxesCombined },
  { to: "/pos", label: "POS", icon: ReceiptText, permission: "sales.manage" },
  { to: "/inventory", label: "Inventory", icon: Boxes, permission: "products.manage" },
  { to: "/reports", label: "Reports", icon: ChartNoAxesCombined, permission: "sales.manage" },
  { to: "/settings", label: "Settings", icon: Settings, permission: "settings.manage" },
  { to: "/users", label: "Users", icon: Users, permission: "users.manage" }
];

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  tone: string;
};

const dismissedNotificationsKey = "wholesalepos.dismissed-notifications";
const readNotificationsKey = "wholesalepos.read-notifications";

function loadNotificationIds(key: string) {
  const parsed = JSON.parse(window.localStorage.getItem(key) ?? "[]");
  return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
}

function saveNotificationIds(key: string, ids: string[]) {
  window.localStorage.setItem(key, JSON.stringify(ids));
}

function AuthScreen({ onSession }: { onSession: (session: AuthSession) => void }) {
  const queryClient = useQueryClient();
  const setupStatus = useQuery({ queryKey: ["setup-status"], queryFn: fetchSetupStatus });
  const requiresSetup = setupStatus.data?.requiresSetup ?? false;
  const [form, setForm] = useState({
    name: "Owner",
    storeName: "Main Store",
    email: "",
    password: "",
    rememberMe: true
  });

  const authMutation = useMutation({
    mutationFn: () =>
      requiresSetup
        ? setupOwner({ name: form.name, storeName: form.storeName, email: form.email, password: form.password })
        : login({ email: form.email, password: form.password, rememberMe: form.rememberMe }),
    onSuccess: (session) => {
      saveSession(session);
      onSession(session);
      void queryClient.invalidateQueries();
    }
  });

  return (
    <main className="grid min-h-screen place-items-center bg-slate-100 px-4 py-8 text-ink dark:bg-slate-950 dark:text-white">
      <section className="w-full max-w-md rounded-md border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm font-semibold uppercase text-ocean">WholesalePOS</p>
        <h1 className="mt-2 text-2xl font-bold">{requiresSetup ? "Create owner account" : "Sign in"}</h1>
        <form
          className="mt-6 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            authMutation.mutate();
          }}
        >
          {requiresSetup ? (
            <>
              <label className="block text-sm font-semibold">
                Store name
                <input
                  className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800"
                  value={form.storeName}
                  onChange={(event) => setForm((current) => ({ ...current, storeName: event.target.value }))}
                  required
                />
              </label>
              <label className="block text-sm font-semibold">
                Your name
                <input
                  className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800"
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  required
                />
              </label>
            </>
          ) : null}
          <label className="block text-sm font-semibold">
            Email
            <input
              className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800"
              type="email"
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              required
            />
          </label>
          <label className="block text-sm font-semibold">
            Password
            <input
              className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800"
              type="password"
              minLength={requiresSetup ? 12 : 8}
              value={form.password}
              onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
              required
            />
          </label>
          {!requiresSetup ? (
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={form.rememberMe}
                onChange={(event) => setForm((current) => ({ ...current, rememberMe: event.target.checked }))}
              />
              Keep me signed in
            </label>
          ) : null}
          {authMutation.error ? <p className="rounded-md bg-rose/10 p-3 text-sm font-semibold text-rose">{authMutation.error.message}</p> : null}
          <button className="focus-ring h-11 w-full rounded-md bg-ocean px-4 text-sm font-bold text-white" disabled={authMutation.isPending || setupStatus.isLoading}>
            {authMutation.isPending ? "Working..." : requiresSetup ? "Create account" : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}

function InventoryPasswordGate({ onUnlock }: { onUnlock: () => void }) {
  const [password, setPassword] = useState("");
  const passwordMutation = useMutation({
    mutationFn: verifyPassword,
    onSuccess: () => {
      setPassword("");
      onUnlock();
    }
  });

  return (
    <section className="grid min-h-[calc(100vh-8rem)] place-items-center">
      <form
        className="w-full max-w-md rounded-md border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
        onSubmit={(event) => {
          event.preventDefault();
          passwordMutation.mutate({ password });
        }}
      >
        <h2 className="text-xl font-bold">Unlock Inventory</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Enter your password to manage products and stock.</p>
        <label className="mt-5 block text-sm font-semibold">
          Password
          <input
            className="focus-ring mt-2 h-11 w-full rounded-md border border-slate-200 px-3 dark:border-slate-700 dark:bg-slate-800"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoFocus
            required
          />
        </label>
        {passwordMutation.error ? <p className="mt-3 rounded-md bg-rose/10 p-3 text-sm font-semibold text-rose">{passwordMutation.error.message}</p> : null}
        <button className="focus-ring mt-5 h-11 w-full rounded-md bg-ocean px-4 text-sm font-bold text-white" disabled={passwordMutation.isPending}>
          {passwordMutation.isPending ? "Checking..." : "Unlock Inventory"}
        </button>
      </form>
    </section>
  );
}

export function App() {
  const queryClient = useQueryClient();
  const [darkMode, setDarkMode] = useState(false);
  const [session, setSession] = useState<AuthSession | null>(() => loadSession());
  const [inventoryUnlocked, setInventoryUnlocked] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [dismissedNotificationIds, setDismissedNotificationIds] = useState<string[]>(() => loadNotificationIds(dismissedNotificationsKey));
  const [readNotificationIds, setReadNotificationIds] = useState<string[]>(() => loadNotificationIds(readNotificationsKey));
  const currentUser = useQuery({ queryKey: ["current-user"], queryFn: fetchCurrentUser, enabled: Boolean(session) });
  const health = useApiHealth();
  const notificationStock = useQuery({ queryKey: ["notifications", "low-stock"], queryFn: () => fetchStock("", true), enabled: Boolean(session) });
  const statusLabel = useMemo(() => {
    if (health.isLoading) return "Checking";
    return health.data?.status === "ok" ? "Online" : "Offline";
  }, [health.data?.status, health.isLoading]);
  const activeNotifications = useMemo(() => {
    const items: NotificationItem[] = [];
    for (const stock of notificationStock.data?.items ?? []) {
      const isOut = stock.quantity <= 0;
      items.push({
        id: `stock-${stock.productId}-${stock.warehouseId}-${isOut ? "out" : "low"}`,
        title: isOut ? "Out of stock" : "Low stock",
        body: `${stock.product.name} has ${stock.quantity.toLocaleString(undefined, { maximumFractionDigits: 3 })} ${stock.product.inventoryUnit.toLowerCase()} left in ${stock.warehouse.name}.`,
        tone: isOut ? "text-rose" : "text-amber"
      });
    }
    if (!health.isLoading && health.data?.status !== "ok") {
      items.push({ id: "connection-offline", title: "Connection alert", body: "The local backend is offline.", tone: "text-rose" });
    }
    return items.filter((item) => !dismissedNotificationIds.includes(item.id));
  }, [dismissedNotificationIds, health.data?.status, health.isLoading, notificationStock.data?.items]);
  const unreadNotificationCount = useMemo(
    () => activeNotifications.filter((notification) => !readNotificationIds.includes(notification.id)).length,
    [activeNotifications, readNotificationIds]
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  useEffect(() => {
    if (!session) return undefined;
    return connectRealtimeUpdates(queryClient);
  }, [queryClient, session]);

  function openNotifications() {
    setNotificationsOpen((value) => {
      const nextOpen = !value;
      if (nextOpen) {
        const nextReadIds = Array.from(new Set([...readNotificationIds, ...activeNotifications.map((notification) => notification.id)]));
        setReadNotificationIds(nextReadIds);
        saveNotificationIds(readNotificationsKey, nextReadIds);
      }
      return nextOpen;
    });
  }

  function clearNotifications() {
    const nextDismissedIds = Array.from(new Set([...dismissedNotificationIds, ...activeNotifications.map((notification) => notification.id)]));
    setDismissedNotificationIds(nextDismissedIds);
    saveNotificationIds(dismissedNotificationsKey, nextDismissedIds);
    setNotificationsOpen(false);
  }

  async function syncAppData() {
    setIsSyncing(true);
    setSyncMessage("");
    try {
      await refreshStockAwareViews(queryClient);
      setSyncMessage("Synced");
    } finally {
      setIsSyncing(false);
      window.setTimeout(() => setSyncMessage(""), 2500);
    }
  }

  if (!session) {
    return <AuthScreen onSession={setSession} />;
  }

  const permissions = currentUser.data?.permissions ?? [];
  const visibleNavItems = navItems.filter((item) => !item.permission || permissions.includes(item.permission));
  const canUseSales = permissions.includes("sales.manage");
  const canManageProducts = permissions.includes("products.manage");
  const canManageUsers = permissions.includes("users.manage");
  const canManageSettings = permissions.includes("settings.manage");

  return (
    <div className="min-h-screen bg-slate-100 text-ink transition-colors dark:bg-slate-950 dark:text-white">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-72 border-r border-slate-200 bg-white px-5 py-6 dark:border-slate-800 dark:bg-slate-900 lg:block">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase text-ocean">WholesalePOS</p>
          <h1 className="mt-1 text-2xl font-bold">Enterprise</h1>
        </div>
        <nav className="space-y-2">
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                [
                  "focus-ring flex items-center gap-3 rounded-md px-3 py-3 text-sm font-semibold transition",
                  isActive
                    ? "bg-ocean text-white"
                    : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                ].join(" ")
              }
            >
              <item.icon aria-hidden="true" size={20} />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 px-4 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90 sm:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                aria-label="Search products, receipts, customers, or suppliers"
                className="focus-ring h-11 w-full rounded-md border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm dark:border-slate-700 dark:bg-slate-800"
                placeholder="Search products, receipts, customers, suppliers"
              />
            </div>
            <span className="rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold dark:border-slate-700">
              {statusLabel}
            </span>
            <div className="flex items-center gap-2">
              <button
                className="focus-ring inline-flex h-11 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-semibold dark:border-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => void syncAppData()}
                disabled={isSyncing}
                aria-label="Sync app data"
              >
                <RefreshCw className={isSyncing ? "animate-spin" : ""} size={17} />
                Sync
              </button>
              {syncMessage ? <span className="text-xs font-semibold text-mint">{syncMessage}</span> : null}
            </div>
            <div className="relative">
              <button
                className="focus-ring relative grid h-11 w-11 place-items-center rounded-md border border-slate-200 dark:border-slate-700"
                aria-label="Notifications"
                onClick={openNotifications}
              >
                <Bell size={19} />
                {unreadNotificationCount ? <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-rose" /> : null}
              </button>
              {notificationsOpen ? (
                <section className="absolute right-0 top-13 z-30 w-80 rounded-md border border-slate-200 bg-white p-4 shadow-lg dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-sm font-bold">Notifications</h2>
                    {activeNotifications.length ? (
                      <button className="focus-ring rounded-md px-2 py-1 text-xs font-bold text-ocean" onClick={clearNotifications}>
                        Clear
                      </button>
                    ) : (
                      <span className="text-xs text-slate-500">Clear</span>
                    )}
                  </div>
                  <div className="mt-3 space-y-2">
                    {activeNotifications.length ? (
                      activeNotifications.map((notification) => (
                        <article key={notification.id} className="rounded-md bg-slate-100 p-3 text-sm dark:bg-slate-800">
                          <p className={`font-bold ${notification.tone}`}>{notification.title}</p>
                          <p className="mt-1 text-slate-600 dark:text-slate-300">{notification.body}</p>
                        </article>
                      ))
                    ) : (
                      <p className="rounded-md bg-slate-100 p-3 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">No notifications.</p>
                    )}
                  </div>
                </section>
              ) : null}
            </div>
            <button
              className="focus-ring grid h-11 w-11 place-items-center rounded-md border border-slate-200 dark:border-slate-700"
              aria-label="Toggle theme"
              onClick={() => setDarkMode((value) => !value)}
            >
              {darkMode ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <button
              className="focus-ring h-11 rounded-md border border-slate-200 px-3 text-sm font-semibold dark:border-slate-700"
              onClick={() => {
                clearSession();
                setInventoryUnlocked(false);
                setSession(null);
              }}
            >
              Sign out
            </button>
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/pos" element={canUseSales ? <PosPage /> : <DashboardPage />} />
            <Route
              path="/inventory"
              element={canManageProducts ? inventoryUnlocked ? <InventoryPage /> : <InventoryPasswordGate onUnlock={() => setInventoryUnlocked(true)} /> : <DashboardPage />}
            />
            <Route path="/reports" element={canUseSales ? <ReportsPage /> : <DashboardPage />} />
            <Route path="/settings" element={canManageSettings ? <SettingsPage /> : <DashboardPage />} />
            <Route path="/users" element={canManageUsers ? <UsersPage /> : <DashboardPage />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
