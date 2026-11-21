"use client";

import { useState } from "react";
import { Image as ImageIcon, MessageCircle } from "lucide-react";
import { Button, Notice } from "@/_shared/components/ui";
import { useT } from "@/_shared/i18n/LanguageProvider";
import { calcService, rs, useLive } from "./calcService";

// Today's rate for each purity, per g / pavan / 10 g. Shared each morning as text or as a picture.
export default function RateChart({ rate, biz }) {
  const { t } = useT();
  const { res, error } = useLive(rate > 0 ? () => calcService.rates(rate) : null, [rate]);
  const [busy, setBusy] = useState(false);
  if (error) return <Notice tone="error">{error}</Notice>;
  if (!res) return <p className="text-sm text-muted">{t("Enter today's fine gold rate.")}</p>;

  const day = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  const name = biz?.name || "Gold rate";
  const text = [`${name} · ${t("Gold rate today")} ${day}`,
    ...res.rows.map((r) => `${r.purity}: ${rs(r.per_gram)}/g · ${rs(r.per_pavan)}/${t("pavan")}`)].join("\n");

  const picture = async () => {
    setBusy(true);
    try {
      const blob = await drawChart(res.rows, name, day, biz?.phone);
      const file = new File([blob], `gold-rate-${new Date().toISOString().slice(0, 10)}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: `${name} · ${day}` });
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      }
    } catch {
      /* share cancelled */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-xl border border-line">
        <table className="w-full text-sm tabular-nums">
          <thead className="bg-canvas text-xs text-muted">
            <tr><th className="px-2 py-2 text-left">{t("Purity")}</th><th className="px-2 text-right">{t("1 g")}</th>
              <th className="px-2 text-right">{t("1 pavan (8 g)")}</th><th className="px-2 text-right">{t("10 g")}</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {res.rows.map((r) => (
              <tr key={r.purity}>
                <td className="px-2 py-2.5 font-semibold">{r.purity} <span className="text-xs font-normal text-muted">{Number(r.purity_percent)}%</span></td>
                <td className="px-2 text-right">{rs(r.per_gram)}</td>
                <td className="px-2 text-right font-semibold">{rs(r.per_pavan)}</td>
                <td className="px-2 text-right">{rs(r.per_10g)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">{t("Gold content only, before wastage, making and GST. 1 tola = 11.664 g: 22K {r}.",
        { r: rs(res.rows.find((r) => r.purity === "22K")?.per_tola) })}</p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={picture} disabled={busy}><ImageIcon size={15} aria-hidden /> {t("Send as picture")}</Button>
        <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3.5 text-sm font-medium hover:bg-canvas">
          <MessageCircle size={15} aria-hidden /> {t("Send as text")}
        </a>
      </div>
    </div>
  );
}

/** A 1080 x 1080 rate card, ready for WhatsApp status or groups. */
function drawChart(rows, name, day, phone) {
  const S = 1080;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const x = c.getContext("2d");
  const accent = "#9f1239";
  x.fillStyle = "#fffaf3";
  x.fillRect(0, 0, S, S);
  x.fillStyle = accent;
  x.fillRect(0, 0, S, 230);
  x.fillStyle = "#fff";
  x.textAlign = "center";
  x.font = "bold 64px Poppins, system-ui, sans-serif";
  x.fillText(name.slice(0, 28), S / 2, 115);
  x.font = "40px Poppins, system-ui, sans-serif";
  x.fillText(`Gold rate · ${day}`, S / 2, 185);

  const cols = [110, 520, 940];
  x.fillStyle = "#6b7280";
  x.font = "34px Poppins, system-ui, sans-serif";
  x.textAlign = "left";
  x.fillText("Purity", cols[0], 320);
  x.textAlign = "right";
  x.fillText("1 gram", cols[1], 320);
  x.fillText("1 pavan (8 g)", cols[2], 320);
  rows.forEach((r, i) => {
    const y = 420 + i * 120;
    if (i % 2 === 0) {
      x.fillStyle = "#f5ebe0";
      x.fillRect(70, y - 75, S - 140, 110);
    }
    x.fillStyle = "#111827";
    x.textAlign = "left";
    x.font = "bold 52px Poppins, system-ui, sans-serif";
    x.fillText(r.purity, cols[0], y);
    x.textAlign = "right";
    x.font = "48px Poppins, system-ui, sans-serif";
    x.fillText(rs(r.per_gram), cols[1], y);
    x.font = "bold 52px Poppins, system-ui, sans-serif";
    x.fillStyle = accent;
    x.fillText(rs(r.per_pavan), cols[2], y);
  });
  x.fillStyle = "#6b7280";
  x.textAlign = "center";
  x.font = "30px Poppins, system-ui, sans-serif";
  x.fillText(`Gold value only. Wastage, making and GST extra.${phone ? `  ·  ${phone}` : ""}`, S / 2, S - 50);
  return new Promise((ok, fail) => c.toBlob((b) => (b ? ok(b) : fail(new Error("Could not draw"))), "image/png"));
}
