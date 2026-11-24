"use client";

import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { useT } from "@/_shared/i18n/LanguageProvider";
import { Barcode, Qr } from "./TagLabel";

const KEY = "code.kind";

/** QR code or barcode, chosen in a column heading and remembered on this device (as in the DFX web app). */
export function useCodeKind() {
  const [kind, setKind] = useState("qr");
  useEffect(() => {
    try {
      setKind(localStorage.getItem(KEY) || "qr");
    } catch {}
  }, []);
  const choose = (k) => {
    setKind(k);
    try {
      localStorage.setItem(KEY, k);
    } catch {}
  };
  return [kind, choose];
}

export function CodeKindSwitch({ kind, onChange }) {
  const { t } = useT();
  return (
    <select value={kind} onChange={(e) => onChange(e.target.value)} aria-label={t("Show QR code or barcode")}
      className="rounded-md border border-accent/50 bg-surface px-1 py-0.5 text-xs font-medium uppercase text-accent">
      <option value="qr">{t("QR code")}</option>
      <option value="barcode">{t("Barcode")}</option>
    </select>
  );
}

/** The piece's code as a small QR or barcode, with a print button. */
export function CodeMark({ code, kind, onPrint }) {
  const { t } = useT();
  return (
    <span className="flex items-center gap-1">
      <span className={kind === "qr" ? "block h-9 w-9" : "block h-8 w-24"} title={code}>
        {kind === "qr" ? <Qr value={code} /> : <Barcode value={code} />}
      </span>
      {onPrint && (
        <button onClick={onPrint} className="rounded-md p-1 text-accent hover:bg-accent-soft" title={t("Print tag")} aria-label={t("Print tag")}>
          <Printer size={14} />
        </button>
      )}
    </span>
  );
}
