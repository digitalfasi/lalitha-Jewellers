"use client";

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { useT } from "@/_shared/i18n/LanguageProvider";

// The "⋯" button on a list row: less-used actions live here, so the row stays
// short and nothing has to scroll sideways. items = [{label, icon, onClick, danger}]
// or {render: () => node} for something custom (e.g. the photo picker).
export default function RowMenu({ items }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const box = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => box.current && !box.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-canvas hover:text-ink" title={t("More")}>
        <MoreHorizontal size={20} aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-1 w-48 rounded-xl border border-line bg-surface p-1 text-sm shadow-lg">
          {items.filter(Boolean).map((it, i) =>
            it.render ? (
              <div key={i} className="px-2 py-1.5" onClick={() => setOpen(false)}>{it.render()}</div>
            ) : (
              <button key={i} type="button" role="menuitem"
                onClick={() => { setOpen(false); it.onClick(); }}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-canvas ${it.danger ? "text-red-700" : ""}`}>
                {it.icon && <it.icon size={16} aria-hidden />} {it.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
