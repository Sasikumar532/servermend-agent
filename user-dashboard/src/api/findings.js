import { apiRequest } from "./client";

export function listFleetFindings() {
  return apiRequest("/findings");
}
