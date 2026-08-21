import { getToken } from "../auth/tokenStore";

// Trailing slash stripped so callers can write paths as "/servers" without
// producing "http://host//servers".
const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api/v1").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// options: { method?, body?, auth? } — auth defaults true; pass false for
// the two routes that must work before a token exists: signup and login.
export async function apiRequest(path, options = {}) {
  const { method = "GET", body, auth = true } = options;
  const headers = { "Content-Type": "application/json" };

  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // Every backend route responds with JSON, including its error bodies
  // (see asyncHandler.js's error middleware), and 204s don't occur in
  // this API, so an empty body only ever means a network-level failure.
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const message =
      data && typeof data === "object" && "error" in data
        ? String(data.error)
        : `Request failed with status ${res.status}`;
    throw new ApiError(res.status, message);
  }

  return data;
}
