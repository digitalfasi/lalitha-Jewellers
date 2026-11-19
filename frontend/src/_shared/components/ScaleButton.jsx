"use client";

import { useState } from "react";
import { Scale } from "lucide-react";
import { beep } from "@/_shared/beep";
import { useT } from "@/_shared/i18n/LanguageProvider";
import { readScale, scaleSupported } from "@/_shared/scale";

// "Read from the scale" next to a weight box: fills the weight in, no typing.
export default function ScaleButton({ onWeight, className = "" }) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  if (!scaleSupported()) return null; // phones, Safari, Firefox: just type the weight

  const read = async () => {
    setBusy(true);
    setError(null);
    try {
      const g = await readScale();
      beep(true);
      onWeight(g);
    } catch (e) {
      beep(false);
      if (e?.name !== "NotFoundError") setError(e.message); // NotFoundError = no device picked
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className={`relative inline-flex ${className}`}>
      <button type="button" onClick={read} disabled={busy} title={t("Read the weight from the scale")}
        className="flex h-9 items-center gap-1 rounded-lg border border-line bg-surface px-2 text-xs font-medium text-accent hover:bg-canvas disabled:opacity-50">
        <Scale size={16} aria-hidden /> {busy ? "…" : t("Scale")}
      </button>
      {error && (
        <span className="absolute right-0 top-10 z-30 w-60 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800 shadow" role="alert"
          onClick={() => setError(null)}>
          {error}
        </span>
      )}
    </span>
  );
}
