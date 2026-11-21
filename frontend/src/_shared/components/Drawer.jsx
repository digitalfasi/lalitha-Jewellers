"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { useT } from "@/_shared/i18n/LanguageProvider";

// A panel that slides in from the right, over the page, for a form (Add stock,
// Edit piece). It scrolls on its own, so the page behind keeps its place.
// Full screen on phones. Esc or the X closes it.
export default function Drawer({ open, onClose, title, children, footer }) {
  const { t } = useT();
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="no-print fixed inset-0 z-40 flex justify-end bg-black/30" onMouseDown={onClose}>
      <aside
        role="dialog"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        className="flex h-full w-full flex-col bg-surface shadow-2xl sm:w-[440px]"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-canvas" aria-label={t("Close")}>
            <X size={20} aria-hidden />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-line bg-surface px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </aside>
    </div>
  );
}
