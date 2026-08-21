import { createContext, useCallback, useContext, useState } from "react";
import { login as apiLogin, signup as apiSignup } from "../api/auth";
import { getEmail, getToken, setSession } from "./tokenStore";

const AuthContext = createContext(undefined);

export function AuthProvider({ children }) {
  const [token, setTokenState] = useState(() => getToken());
  const [email, setEmailState] = useState(() => getEmail());

  const login = useCallback(async (loginEmail, password) => {
    const { token } = await apiLogin(loginEmail, password);
    setSession(token, loginEmail);
    setTokenState(token);
    setEmailState(loginEmail);
  }, []);

  const signup = useCallback(async (signupEmail, password) => {
    const { token } = await apiSignup(signupEmail, password);
    setSession(token, signupEmail);
    setTokenState(token);
    setEmailState(signupEmail);
  }, []);

  const logout = useCallback(() => {
    setSession(null, null);
    setTokenState(null);
    setEmailState(null);
  }, []);

  const value = { isAuthenticated: token !== null, email, login, signup, logout };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
