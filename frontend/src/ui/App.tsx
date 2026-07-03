import { Bell, Boxes, ChartNoAxesCombined, Moon, ReceiptText, Search, Sun, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DashboardPage } from "../views/DashboardPage";
import { PosPage } from "../views/PosPage";
import { InventoryPage } from "../views/InventoryPage";
import { UsersPage } from "../views/UsersPage";
import { useApiHealth } from "../lib/useApiHealth";
import { clearSession, fetchCurrentUser, fetchSetupStatus, loadSession, login, saveSession, setupOwner, type AuthSession } from "../lib/api";

const navItems = [
  { to: "/", label: "Dashboard", icon: ChartNoAxesCombined },
  { to: "/pos", label: "POS", icon: ReceiptText, permission: "sales.manage" },
  { to: "/inventory", label: "Inventory", icon: Boxes, permission: "products.manage" },
  { to: "/users", label: "Users", icon: Users, permission: "users.manage" }
];

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

export function App() {
  const [darkMode, setDarkMode] = useState(false);
  const [session, setSession] = useState<AuthSession | null>(() => loadSession());
  const currentUser = useQuery({ queryKey: ["current-user"], queryFn: fetchCurrentUser, enabled: Boolean(session) });
  const health = useApiHealth();
  const statusLabel = useMemo(() => {
    if (health.isLoading) return "Checking";
    return health.data?.status === "ok" ? "Online" : "Offline";
  }, [health.data?.status, health.isLoading]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  if (!session) {
    return <AuthScreen onSession={setSession} />;
  }

  const permissions = currentUser.data?.permissions ?? [];
  const visibleNavItems = navItems.filter((item) => !item.permission || permissions.includes(item.permission));
  const canUseSales = permissions.includes("sales.manage");
  const canManageProducts = permissions.includes("products.manage");
  const canManageUsers = permissions.includes("users.manage");

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
            <button
              className="focus-ring grid h-11 w-11 place-items-center rounded-md border border-slate-200 dark:border-slate-700"
              aria-label="Notifications"
            >
              <Bell size={19} />
            </button>
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
            <Route path="/inventory" element={canManageProducts ? <InventoryPage /> : <DashboardPage />} />
            <Route path="/users" element={canManageUsers ? <UsersPage /> : <DashboardPage />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
