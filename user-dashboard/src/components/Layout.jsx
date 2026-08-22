import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Button } from "./Button";

function DashboardIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="shrink-0">
      <rect x="3" y="3" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="13" y="3" width="8" height="5" rx="1.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="13" y="10" width="8" height="11" rx="1.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function ServerIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="shrink-0">
      <rect x="3" y="4" width="18" height="6" rx="1.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="3" y="14" width="18" height="6" rx="1.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="7" cy="7" r="0.75" fill="currentColor" />
      <circle cx="7" cy="17" r="0.75" fill="currentColor" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="shrink-0">
      <circle cx="12" cy="8" r="3.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path
        d="M4.5 20c1.4-3.6 4.4-5.5 7.5-5.5s6.1 1.9 7.5 5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PanelToggleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <line x1="9" y1="4" x2="9" y2="20" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", end: true, Icon: DashboardIcon },
  { to: "/servers", label: "Servers", end: true, Icon: ServerIcon },
  { to: "/profile", label: "Profile", end: true, Icon: ProfileIcon },
];

const COLLAPSED_KEY = "servermend_sidebar_collapsed";

// Navigation stays plain react-router NavLink (styled with Tailwind)
// rather than HeroUI's Link — HeroUI's docs don't confirm a working
// react-router integration, and NavLink's isActive callback is exactly
// what the active-nav-item highlight needs.
export function Layout() {
  const { email, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSED_KEY) === "true");

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSED_KEY, String(next));
      return next;
    });
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* `dark` applied directly here, not just on <html> — HeroUI's
          tokens are defined under `.dark,[data-theme=dark] { ... }`, and
          CSS custom properties cascade by DOM proximity, so scoping this
          class to the sidebar itself keeps it dark regardless of the
          app-wide light/dark/system choice (see ThemeToggle). `fixed`
          (not just a flex sibling) so the sidebar stays put in the
          viewport as the page scrolls — a tall page like Profile or a
          long findings list would otherwise scroll the nav out of view
          along with everything else, since it shared the same normal
          document flow as <main>. z-30 keeps it above page content but
          below ThemeToggle's own fixed layer isn't a concern — they sit
          on opposite corners. */}
      <aside
        className={`dark fixed inset-y-0 left-0 z-30 flex flex-col gap-6 border-r border-border bg-surface p-4 transition-[width] duration-150 ${collapsed ? "w-16" : "w-56"}`}
      >
        <div className="flex items-center justify-between">
          {!collapsed && <div className="px-2 text-lg font-bold tracking-tight text-accent">ServerMend</div>}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-default hover:text-foreground ${collapsed ? "mx-auto" : ""}`}
          >
            <PanelToggleIcon />
          </button>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map(({ to, label, end, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${collapsed ? "justify-center px-0" : ""} ${
                  isActive ? "bg-accent/10 text-accent" : "text-muted hover:bg-default hover:text-foreground"
                }`
              }
            >
              <Icon />
              {!collapsed && label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-2 border-t border-border pt-4">
          {!collapsed && email && (
            <div className="truncate px-2 text-xs text-muted" title={email}>
              {email}
            </div>
          )}
          <Button
            variant="outline"
            className={collapsed ? "mx-auto px-0!" : "w-full"}
            onClick={logout}
            aria-label="Log out"
            title={collapsed ? "Log out" : undefined}
          >
            {collapsed ? <LogoutIcon /> : "Log out"}
          </Button>
        </div>
      </aside>
      {/* pt-20 (not py-6's usual top value) clears the fixed top-right
          ThemeToggle, which otherwise overlaps page-header content like
          the "Add server" button. ml-* matches the now-fixed aside's
          current width so content never sits underneath it. */}
      <main
        className={`flex w-full flex-1 flex-col gap-7 px-8 pt-20 pb-6 transition-[margin-left] duration-150 ${collapsed ? "ml-16" : "ml-56"}`}
      >
        <Outlet />
      </main>
    </div>
  );
}
