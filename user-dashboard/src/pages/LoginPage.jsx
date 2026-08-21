import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Input, Label, TextField } from "@heroui/react";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { PasswordField } from "../components/PasswordField";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/servers");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed.");
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
        <h1 className="text-xl font-semibold">Log in</h1>
        {error && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        <TextField value={email} onChange={setEmail} name="email">
          <Label>Email</Label>
          <Input type="email" placeholder="you@example.com" autoFocus />
        </TextField>
        <PasswordField label="Password" value={password} onChange={setPassword} required />
        <Button type="submit" isDisabled={submitting}>
          {submitting ? "Logging in…" : "Log in"}
        </Button>
        <p className="text-sm text-muted">
          No account?{" "}
          <Link to="/signup" className="text-accent hover:underline">
            Sign up
          </Link>
        </p>
      </form>
    </div>
  );
}
