import { Button, Card } from "@heroui/react";
import { useAuth } from "../auth/AuthContext";

// There's no GET /me endpoint on the backend and no profile-editing
// endpoints (auth.js only exposes signup/login) — email is the only
// account detail the frontend has, carried over from the login/signup
// form into tokenStore. Keep this page to what's actually backed by data.
export function ProfilePage() {
  const { email, logout } = useAuth();
  const initial = email ? email.charAt(0).toUpperCase() : "?";

  return (
    <div className="flex flex-col gap-7">
      <h1 className="text-2xl font-semibold">Profile</h1>

      <Card>
        <Card.Content className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xl font-bold text-accent">
            {initial}
          </div>
          <div className="flex flex-col">
            <span className="text-sm text-muted">Signed in as</span>
            <span className="font-medium">{email ?? "unknown"}</span>
          </div>
        </Card.Content>
      </Card>

      <Card>
        <Card.Header>
          <Card.Title>Account</Card.Title>
        </Card.Header>
        <Card.Content>
          <p className="text-sm text-muted">
            Account management (password changes, deleting your account) isn&apos;t available yet — reach out if
            you need either.
          </p>
        </Card.Content>
        <Card.Footer>
          <Button variant="danger" onPress={logout}>
            Log out
          </Button>
        </Card.Footer>
      </Card>
    </div>
  );
}
