import { Bell, Boxes, ChartNoAxesCombined, Moon, ReceiptText, Search, Sun } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { DashboardPage } from "../views/DashboardPage";
import { PosPage } from "../views/PosPage";
import { InventoryPage } from "../views/InventoryPage";
import { useApiHealth } from "../lib/useApiHealth";

const navItems = [
  { to: "/", label: "Dashboard", icon: ChartNoAxesCombined },
  { to: "/pos", label: "POS", icon: ReceiptText },
  { to: "/inventory", label: "Inventory", icon: Boxes }
];

export function App() {
  const [darkMode, setDarkMode] = useState(false);
  const health = useApiHealth();
  const statusLabel = useMemo(() => {
    if (health.isLoading) return "Checking";
    return health.data?.status === "ok" ? "Online" : "Offline";
  }, [health.data?.status, health.isLoading]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  return (
    <div className="min-h-screen bg-slate-100 text-ink transition-colors dark:bg-slate-950 dark:text-white">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-72 border-r border-slate-200 bg-white px-5 py-6 dark:border-slate-800 dark:bg-slate-900 lg:block">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase text-ocean">WholesalePOS</p>
          <h1 className="mt-1 text-2xl font-bold">Enterprise</h1>
        </div>
        <nav className="space-y-2">
          {navItems.map((item) => (
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
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/pos" element={<PosPage />} />
            <Route path="/inventory" element={<InventoryPage />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
