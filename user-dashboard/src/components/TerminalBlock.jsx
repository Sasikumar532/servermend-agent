import { CopyButton } from "./CopyButton";

// A command block styled like a terminal window (traffic-light dots,
// monospace, a $ prompt) rather than a plain <pre> — used wherever the
// user needs to copy a real shell command (currently just the agent
// install command in AddServerModal).
export function TerminalBlock({ command, copyLabel = "Copy command" }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="flex items-center justify-between bg-default px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-danger/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-success/70" />
        </div>
        <CopyButton text={command} label={copyLabel} />
      </div>
      <pre className="overflow-x-auto bg-background px-4 py-3 font-mono text-[13px] leading-relaxed text-foreground">
        <span className="text-success">$ </span>
        {command}
      </pre>
    </div>
  );
}
