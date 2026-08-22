import { apiRequest } from "./client";

export function getDashboardSummary() {
  return apiRequest("/dashboard/summary");
}
