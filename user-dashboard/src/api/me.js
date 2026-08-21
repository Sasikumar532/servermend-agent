import { apiRequest } from "./client";

export function getProfile() {
  return apiRequest("/me");
}

export function updateProfile(fields) {
  return apiRequest("/me", { method: "PATCH", body: fields });
}
