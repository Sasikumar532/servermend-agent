import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { PasswordField } from "../components/PasswordField";

// Matches the backend's own rule exactly (routes/auth.js: password.length
// < 8 -> 400) — this is a UX nicety to fail fast client-side, not a
// substitute for the server-side check.
const MIN_PASSWORD_LENGTH = 8;

export function SignupPage() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    setSubmitting(true);
    try {
      await signup(email, password);
      navigate("/servers");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign up failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-form" onSubmit={handleSubmit}>
        <h1>Sign up</h1>
        {error && <p className="form-error">{error}</p>}
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </label>
        <PasswordField
          label="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={MIN_PASSWORD_LENGTH}
          required
        />
        <button type="submit" disabled={submitting}>
          {submitting ? "Creating account…" : "Sign up"}
        </button>
        <p className="auth-switch">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </form>
    </div>
  );
}
