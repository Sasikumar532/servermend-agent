import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { ThemeToggle } from "./components/ThemeToggle";
import { AuthProvider } from "./auth/AuthContext";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { ProfilePage } from "./pages/ProfilePage";
import { ServerDetailPage } from "./pages/ServerDetailPage";
import { ServerListPage } from "./pages/ServerListPage";
import { ServerReportsPage } from "./pages/ServerReportsPage";
import { SignupPage } from "./pages/SignupPage";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        {/* Fixed-position, rendered once outside <Routes> so it stays put
            across every page — including /login and /signup, which sit
            outside the sidebar Layout entirely. */}
        <ThemeToggle />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/servers" element={<ServerListPage />} />
              <Route path="/servers/:serverId" element={<ServerDetailPage />} />
              <Route path="/servers/:serverId/reports" element={<ServerReportsPage />} />
              <Route path="/profile" element={<ProfilePage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
