import { NavLink, Outlet } from "react-router-dom";
import { useEffect } from "react";
import { useSettingsStore } from "@/store/settingsStore";

const nav = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/bank", label: "Question Bank" },
  { to: "/history", label: "History" },
  { to: "/settings", label: "Settings" },
];

export default function Layout() {
  const { settings, loaded, load, update } = useSettingsStore();

  useEffect(() => {
    load();
  }, [load]);

  const cycleTheme = () => {
    const order: Array<typeof settings.dark_mode> = ["system", "light", "dark"];
    const next = order[(order.indexOf(settings.dark_mode) + 1) % order.length];
    update({ dark_mode: next });
  };

  return (
    <div className="min-h-full flex flex-col bg-[var(--bg)] text-[var(--text)]">
      <header className="border-b border-[var(--border)] bg-[var(--surface)] sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <NavLink to="/" className="font-semibold tracking-tight text-[15px] flex items-center gap-2">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-[var(--accent)] text-white text-xs font-bold">d</span>
            dMAT Test Series
          </NavLink>
          <nav className="flex items-center gap-1 text-sm">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-md transition-colors ${
                    isActive
                      ? "bg-[var(--accent-soft)] text-[var(--accent)] font-medium"
                      : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
            {loaded && (
              <button
                onClick={cycleTheme}
                title={`Theme: ${settings.dark_mode}`}
                className="ml-2 h-8 w-8 rounded-md border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] flex items-center justify-center text-sm"
              >
                {settings.dark_mode === "dark" ? "🌙" : settings.dark_mode === "light" ? "☀️" : "🖥️"}
              </button>
            )}
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
