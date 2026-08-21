import { apiRequest } from "./client";

export function listServers() {
  return apiRequest("/servers");
}

// hostname is optional — the backend accepts an empty body.
export function createServer(hostname) {
  return apiRequest("/servers", { method: "POST", body: hostname ? { hostname } : {} });
}

export function getServer(serverId) {
  return apiRequest(`/servers/${encodeURIComponent(serverId)}`);
}

export function getReports(serverId) {
  return apiRequest(`/servers/${encodeURIComponent(serverId)}/reports`);
}

export function getFindings(serverId) {
  return apiRequest(`/servers/${encodeURIComponent(serverId)}/findings`);
}

export function getBaseline(serverId) {
  return apiRequest(`/servers/${encodeURIComponent(serverId)}/baseline`);
}

export function confirmBaseline(serverId) {
  return apiRequest(`/servers/${encodeURIComponent(serverId)}/baseline/confirm`, { method: "POST" });
}

export function getAlerts(serverId) {
  return apiRequest(`/servers/${encodeURIComponent(serverId)}/alerts`);
}

export function getRemediation(serverId, checkId) {
  return apiRequest(
    `/servers/${encodeURIComponent(serverId)}/findings/${encodeURIComponent(checkId)}/remediation`,
    { method: "POST" }
  );
}
