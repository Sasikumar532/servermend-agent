import { apiRequest } from "./client";

export function signup(email, password) {
  return apiRequest("/auth/signup", { method: "POST", body: { email, password }, auth: false });
}

export function login(email, password) {
  return apiRequest("/auth/login", { method: "POST", body: { email, password }, auth: false });
}
