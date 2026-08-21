// A small module-level store, not just localStorage directly, so
// api/client.js can read the current token synchronously on every request
// without importing React or AuthContext (which would create a dependency
// cycle: AuthContext -> api/* -> AuthContext).
const TOKEN_KEY = "servermend_token";
const EMAIL_KEY = "servermend_email";

let currentToken = localStorage.getItem(TOKEN_KEY);
let currentEmail = localStorage.getItem(EMAIL_KEY);

export function getToken() {
  return currentToken;
}

// The backend's JWT carries only the user ID, not the email (see
// signUserToken in userAuth.js) — there's no GET /me endpoint to fetch it
// back from. Stored here from what the user typed into the login/signup
// form itself, so the sidebar can show "signed in as" without inventing
// data or adding a backend endpoint for it.
export function getEmail() {
  return currentEmail;
}

// Updates only the cached email, leaving the token untouched — used to
// backfill sessions that predate email being stored at all (a token saved
// before this field existed has no EMAIL_KEY entry), once the real value
// comes back from an authenticated request like GET /me.
export function setEmail(email) {
  currentEmail = email;
  if (email) {
    localStorage.setItem(EMAIL_KEY, email);
  } else {
    localStorage.removeItem(EMAIL_KEY);
  }
}

export function setSession(token, email) {
  currentToken = token;
  currentEmail = email;

  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }

  if (email) {
    localStorage.setItem(EMAIL_KEY, email);
  } else {
    localStorage.removeItem(EMAIL_KEY);
  }
}
