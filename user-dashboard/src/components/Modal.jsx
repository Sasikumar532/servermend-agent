import { useEffect } from "react";

// Plain fixed-overlay modal, styled to match the design directly —
// replaces HeroUI's Modal.*. Click on the backdrop or Escape closes it;
// click inside the dialog does not (stopPropagation).
export function Modal({ title, onClose, children, footer, maxWidthClassName = "max-w-155" }) {
  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-8">
      <div
        onClick={(event) => event.stopPropagation()}
        className={`w-full ${maxWidthClassName} rounded-2xl border border-border bg-surface shadow-2xl`}
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-5">
          <div className="text-base font-semibold text-foreground">{title}</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-lg leading-none text-muted hover:text-foreground"
          >
            &times;
          </button>
        </div>
        <div className="p-6">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-border px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}
