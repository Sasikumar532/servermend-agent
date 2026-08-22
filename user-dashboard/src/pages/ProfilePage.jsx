import { useEffect, useState } from "react";
import { Button, Card, Input, Label, TextField } from "@heroui/react";
import { ApiError } from "../api/client";
import { getProfile, updateProfile } from "../api/me";
import { useAuth } from "../auth/AuthContext";
import { useToast } from "../components/Toast";

const FIELDS = [
  { key: "firstName", label: "First name", placeholder: "Ada" },
  { key: "lastName", label: "Last name", placeholder: "Lovelace" },
  { key: "mobileNumber", label: "Mobile number", placeholder: "+1 555 0100" },
  { key: "companyName", label: "Company name", placeholder: "Analytical Engines Ltd" },
  { key: "position", label: "Position", placeholder: "Security Engineer" },
];

const EMPTY_FORM = { firstName: "", lastName: "", mobileNumber: "", companyName: "", position: "" };

export function ProfilePage() {
  const { email, logout, syncEmail } = useAuth();
  const { showToast } = useToast();
  const [form, setForm] = useState(EMPTY_FORM);
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getProfile()
      .then((profile) => {
        if (cancelled) return;
        setForm({
          firstName: profile.firstName ?? "",
          lastName: profile.lastName ?? "",
          mobileNumber: profile.mobileNumber ?? "",
          companyName: profile.companyName ?? "",
          position: profile.position ?? "",
        });
        // Backfills sessions whose token predates email being cached
        // locally at all (see tokenStore.setEmail) — GET /me is the first
        // point this page has the real email back from the backend.
        if (profile.email && profile.email !== email) syncEmail(profile.email);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : "Failed to load profile.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // Deliberately runs once on mount only — `email`/`syncEmail` changing
    // as a result of the backfill above shouldn't re-trigger the fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await updateProfile(form);
      showToast("Profile saved.", { type: "success" });
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Failed to save profile.", { type: "error" });
    } finally {
      setSaving(false);
    }
  }

  const fullName = [form.firstName, form.lastName].filter(Boolean).join(" ");
  const initials = `${form.firstName.charAt(0)}${form.lastName.charAt(0)}`.toUpperCase();
  const avatarLabel = initials || (email ? email.charAt(0).toUpperCase() : "?");

  return (
    <div className="flex flex-col gap-7">
      <h1 className="text-2xl font-semibold">Profile</h1>

      <Card>
        <Card.Content className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xl font-bold text-accent">
            {avatarLabel}
          </div>
          <div className="flex flex-col">
            {!fullName && <span className="text-sm text-muted">Signed in as</span>}
            <span className="font-medium">{fullName || email || "unknown"}</span>
            {fullName && email && <span className="text-xs text-muted">{email}</span>}
          </div>
        </Card.Content>
      </Card>

      <Card>
        <Card.Header>
          <Card.Title>Profile details</Card.Title>
          <Card.Description>Email isn&apos;t editable here — it&apos;s your sign-in identity.</Card.Description>
        </Card.Header>
        <Card.Content>
          {loading ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : loadError ? (
            <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{loadError}</p>
          ) : (
            <form id="profile-form" className="flex flex-col gap-4" onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {FIELDS.map(({ key, label, placeholder }) => (
                  <TextField key={key} value={form[key]} onChange={(value) => setField(key, value)} name={key}>
                    <Label>{label}</Label>
                    <Input placeholder={placeholder} />
                  </TextField>
                ))}
              </div>
            </form>
          )}
        </Card.Content>
        {!loading && !loadError && (
          <Card.Footer className="justify-end">
            <Button type="submit" form="profile-form" isDisabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </Card.Footer>
        )}
      </Card>

      <Card>
        <Card.Header>
          <Card.Title>Account</Card.Title>
        </Card.Header>
        <Card.Footer>
          <Button variant="danger" onPress={logout}>
            Log out
          </Button>
        </Card.Footer>
      </Card>
    </div>
  );
}
