// A small module-level store, not just localStorage directly, so
// api/client.js can read the current token synchronously on every request
// without importing React or AuthContext (which would create a dependency
// cycle: AuthContext -> api/* -> AuthContext).
const STORAGE_KEY = "servermend_token";

let currentToken = localStorage.getItem(STORAGE_KEY);

export function getToken() {
  return currentToken;
}

export function setToken(token) {
  currentToken = token;
  if (token) {
    localStorage.setItem(STORAGE_KEY, token);
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}
