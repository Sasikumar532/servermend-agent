import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Input, Label, TextField } from "@heroui/react";
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
    <div className="flex min-h-screen items-center justify-center bg-background">
      <form
        className="flex w-80 flex-col gap-4 rounded-xl border border-border bg-surface p-8"
        onSubmit={handleSubmit}
      >
        <h1 className="text-xl font-semibold">Sign up</h1>
        {error && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        <TextField value={email} onChange={setEmail} name="email">
          <Label>Email</Label>
          <Input type="email" placeholder="you@example.com" autoFocus />
        </TextField>
        <PasswordField
          label="Password"
          value={password}
          onChange={setPassword}
          minLength={MIN_PASSWORD_LENGTH}
          required
        />
        <Button type="submit" isDisabled={submitting}>
          {submitting ? "Creating account…" : "Sign up"}
        </Button>
        <p className="text-sm text-muted">
          Already have an account?{" "}
          <Link to="/login" className="text-accent hover:underline">
            Log in
          </Link>
        </p>
      </form>
    </div>
  );
}
