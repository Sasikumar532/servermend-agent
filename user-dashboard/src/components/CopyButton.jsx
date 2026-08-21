import { useState } from "react";

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <rect x="9" y="9" width="12" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <path
        d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <path
        d="M20 6 9 17l-5-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// A plain <button>, not HeroUI's Button — this needs precise compact
// icon+label sizing and gets absolutely-positioned over a <pre> block in
// AddServerModal, which is simpler to get right without a component
// library's own padding/sizing defaults to work around.
export function CopyButton({ text, label = "Copy" }) {
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    try {
      // Requires a secure context (https, or localhost for dev) — true
      // for this app in both dev and any real deployment.
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // The value is still selectable/copyable by hand either way, so a
      // failed clipboard write (permission denied, insecure context) is a
      // silent no-op rather than an error worth surfacing.
    }
  }

  return (
    <button
      type="button"
      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted transition-colors hover:text-foreground"
      onClick={handleClick}
      aria-label={copied ? "Copied" : label}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
      <span className="whitespace-nowrap">{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}
