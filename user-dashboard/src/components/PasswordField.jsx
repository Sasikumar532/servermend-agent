import { useState } from "react";
import { Input, Label, TextField } from "@heroui/react";

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        d="M1 12S5 5 12 5s11 7 11 7-4 7-11 7-11-7-11-7Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        d="M17.94 17.94A10.94 10.94 0 0 1 12 20C5 20 1 13 1 13a20.3 20.3 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 7 11 7a20.3 20.3 0 0 1-3.22 4.44M14.12 14.12a3 3 0 1 1-4.24-4.24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// Built on HeroUI's TextField/Input rather than a documented endContent
// slot — HeroUI v3's Input docs don't show one, so the toggle is a plain
// absolutely-positioned button over the input instead.
export function PasswordField({ label, value, onChange, minLength, required, autoFocus }) {
  const [visible, setVisible] = useState(false);

  return (
    <TextField value={value} onChange={onChange} name="password">
      <Label>{label}</Label>
      <div className="relative">
        <Input
          type={visible ? "text" : "password"}
          minLength={minLength}
          required={required}
          autoFocus={autoFocus}
          className="pr-10"
        />
        <button
          type="button"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted transition-colors hover:text-foreground"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
    </TextField>
  );
}
