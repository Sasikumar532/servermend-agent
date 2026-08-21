import { Link, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function Layout() {
  const { logout } = useAuth();

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/servers" className="brand">
          ServerMend
        </Link>
        <button type="button" className="button-ghost" onClick={logout}>
          Log out
        </button>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
