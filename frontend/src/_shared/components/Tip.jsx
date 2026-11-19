"use client";

import { useEffect, useState } from "react";
import { Lightbulb, X } from "lucide-react";
import { useT } from "@/_shared/i18n/LanguageProvider";

// A first-time tip: shown until the person closes it, then never again on
// this device. `id` names the tip; change it to show a reworded tip again.
export default function Tip({ id, children }) {
  const { t } = useT();
  const key = `tip.${id}`;
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      setShow(localStorage.getItem(key) !== "seen");
    } catch {
      setShow(true);
    }
  }, [key]);

  if (!show) return null;
  const close = () => {
    setShow(false);
    try {
      localStorage.setItem(key, "seen");
    } catch {}
  };
  return (
    <div className="no-print flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900" role="note">
      <Lightbulb size={18} className="mt-0.5 shrink-0" aria-hidden />
      <div className="flex-1">{children}</div>
      <button onClick={close} className="flex shrink-0 items-center gap-1 text-xs font-medium hover:underline" aria-label={t("Got it")}>
        {t("Got it")} <X size={14} aria-hidden />
      </button>
    </div>
  );
}
