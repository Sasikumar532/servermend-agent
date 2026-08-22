// Plain underline tab bar, styled to match the design directly — replaces
// HeroUI's Tabs.*. State lives in the parent (`value`/`onChange`); panels
// are just conditionally rendered by the parent, not a separate API.
export function Tabs({ tabs, value, onChange, "aria-label": ariaLabel }) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="flex gap-1 border-b border-border">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
            value === t.id ? "border-accent text-accent" : "border-transparent text-muted hover:text-foreground"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
