// Plain bordered/surfaced panel, styled to match the design directly —
// replaces HeroUI's Card.*. Not a compound component on one object (no
// shared behavior to coordinate), just a handful of small pieces meant to
// be composed: <Card><Card.Header>…</Card.Header><Card.Content>…</Card.Content></Card>

export function Card({ className = "", ...props }) {
  return <div className={`rounded-xl border border-border bg-surface ${className}`} {...props} />;
}

Card.Header = function CardHeader({ className = "", ...props }) {
  return <div className={`flex flex-col gap-1 px-5 pt-5 ${className}`} {...props} />;
};

Card.Title = function CardTitle({ className = "", ...props }) {
  return <h3 className={`text-sm font-semibold text-foreground ${className}`} {...props} />;
};

Card.Description = function CardDescription({ className = "", ...props }) {
  return <p className={`text-xs text-muted ${className}`} {...props} />;
};

Card.Content = function CardContent({ className = "", ...props }) {
  return <div className={`p-5 ${className}`} {...props} />;
};

Card.Footer = function CardFooter({ className = "", ...props }) {
  return <div className={`flex items-center gap-2 border-t border-border px-5 py-4 ${className}`} {...props} />;
};
