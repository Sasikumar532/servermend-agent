import { createContext, useCallback, useContext, useState } from "react";
import { login as apiLogin, signup as apiSignup } from "../api/auth";
import { getToken, setToken as persistToken } from "./tokenStore";

const AuthContext = createContext(undefined);

export function AuthProvider({ children }) {
  const [token, setTokenState] = useState(() => getToken());

  const login = useCallback(async (email, password) => {
    const { token } = await apiLogin(email, password);
    persistToken(token);
    setTokenState(token);
  }, []);

  const signup = useCallback(async (email, password) => {
    const { token } = await apiSignup(email, password);
    persistToken(token);
    setTokenState(token);
  }, []);

  const logout = useCallback(() => {
    persistToken(null);
    setTokenState(null);
  }, []);

  const value = { isAuthenticated: token !== null, login, signup, logout };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
