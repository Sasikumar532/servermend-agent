import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AuthProvider } from "./auth/AuthContext";
import { LoginPage } from "./pages/LoginPage";
import { ServerDetailPage } from "./pages/ServerDetailPage";
import { ServerListPage } from "./pages/ServerListPage";
import { ServerReportsPage } from "./pages/ServerReportsPage";
import { SignupPage } from "./pages/SignupPage";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/" element={<Navigate to="/servers" replace />} />
              <Route path="/servers" element={<ServerListPage />} />
              <Route path="/servers/:serverId" element={<ServerDetailPage />} />
              <Route path="/servers/:serverId/reports" element={<ServerReportsPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/servers" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
