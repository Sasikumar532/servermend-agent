const VARIANT_CLASSES = {
  primary: "border border-transparent bg-accent text-accent-foreground font-semibold hover:opacity-90",
  outline:
    "border border-border bg-surface text-foreground font-medium hover:border-accent hover:text-accent",
  ghost: "border border-transparent bg-transparent text-muted font-medium hover:bg-default hover:text-foreground",
  danger: "border border-danger bg-transparent text-danger font-semibold hover:bg-danger/10",
  "danger-solid": "border border-transparent bg-danger text-white font-semibold hover:opacity-90",
};

const SIZE_CLASSES = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-4 text-sm",
};

// Plain <button>, styled to match the ServerMend User App design (imported
// from claude.ai/design) directly — no component library underneath.
export function Button({ variant = "primary", size = "md", className = "", type = "button", ...props }) {
  return (
    <button
      type={type}
      className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...props}
    />
  );
}
