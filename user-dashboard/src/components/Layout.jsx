import { Button } from "@heroui/react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const NAV_ITEMS = [{ to: "/servers", label: "Servers", end: true }];

// Navigation stays plain react-router NavLink (styled with Tailwind)
// rather than HeroUI's Link — HeroUI's docs don't confirm a working
// react-router integration, and NavLink's isActive callback is exactly
// what the active-nav-item highlight needs.
export function Layout() {
  const { email, logout } = useAuth();

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="flex w-56 shrink-0 flex-col gap-6 border-r border-border bg-surface p-4">
        <div className="px-2 text-lg font-bold tracking-tight text-accent">ServerMend</div>
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? "bg-accent/10 text-accent" : "text-muted hover:bg-default hover:text-foreground"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-2 border-t border-border pt-4">
          {email && (
            <div className="truncate px-2 text-xs text-muted" title={email}>
              {email}
            </div>
          )}
          <Button variant="outline" className="w-full" onPress={logout}>
            Log out
          </Button>
        </div>
      </aside>
      <main className="flex w-full flex-1 flex-col gap-7 px-8 py-6">
        <Outlet />
      </main>
    </div>
  );
}
