// Plain label+input pair, styled to match the design directly — replaces
// HeroUI's TextField/Label/Input. `hint` renders as muted trailing text
// next to the label (e.g. "(optional, for display only)").
export function Field({ label, hint, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted">
        {label}
        {hint && <span className="font-normal"> {hint}</span>}
      </span>
      {children}
    </label>
  );
}

// `onChange` receives the new value directly (not an event) — matches the
// ergonomics every call site already used under HeroUI's TextField, so
// swapping the import was the only change needed at most call sites.
export function TextInput({ className = "", onChange, ...props }) {
  return (
    <input
      onChange={onChange ? (event) => onChange(event.target.value) : undefined}
      className={`h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted focus:border-accent ${className}`}
      {...props}
    />
  );
}
