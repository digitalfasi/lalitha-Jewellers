"use client";

import { useEffect, useState } from "react";
import { Copy, Image as ImageIcon, MessageCircle, X } from "lucide-react";
import { Button, Field, Input } from "@/_shared/components/ui";
import { useT } from "@/_shared/i18n/LanguageProvider";
import { g3, rs } from "./calcService";

// A tidy WhatsApp message for any answer, and a full quotation for Quick quote:
// business name, date, the shop, each item with its weight, % and fine, the totals,
// how long the rate holds, and the business phone. *bold* is WhatsApp's own formatting.

const today = () => new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const LINE = "────────────";

/** WhatsApp wants the number with the country code and nothing else: 9840098400 -> 919840098400. */
export function waNumber(phone) {
  let d = String(phone || "").replace(/\D/g, "");
  if (d.startsWith("0")) d = d.replace(/^0+/, "");
  if (d.length === 10) d = `91${d}`;
  return d.length >= 11 && d.length <= 15 ? d : "";
}

export function buildMessage({ result, biz, shop, t, items = true, showRate = true, note = "" }) {
  const out = [];
  if (biz?.name) out.push(`*${biz.name}*`);
  if (note.trim()) out.push(note.trim(), "");
  const q = result.quote;
  if (q) {
    out.push(`*${t("Quotation")}*${q.estimate ? ` ${q.estimate.estimate_number}` : ""} · ${today()}`);
    if (shop) out.push(`${t("To")}: ${shop.name}${shop.city ? `, ${shop.city}` : ""}`);
    if (showRate) out.push(`${t("Gold rate")}: ${rs(q.rate)}/g (${t("fine")})`);
    out.push(LINE);
    if (items) {
      q.lines.forEach((l, i) => {
        out.push(`${i + 1}. *${l.code}* ${l.description} (${l.purity})`);
        out.push(`   ${t("Net")} ${g3(l.net_weight)} × ${Number(l.touch_percent)}% = ${g3(l.fine_weight)} ${t("fine")}`);
        if (l.stone_amount > 0) out.push(`   ${t("Stones")} ${rs(l.stone_amount)}`);
        out.push(`   ${rs(l.amount)}`);
      });
      out.push(LINE);
    } else {
      out.push(`${q.lines.length} ${t("items")}: ${q.lines.map((l) => l.code).join(", ")}`);
    }
    const tt = q.totals;
    out.push(`${t("Fine gold")}: ${g3(tt.total_fine)}`);
    out.push(`${t("Gold value")}: ${rs(tt.metal_amount)}`);
    if (tt.stone_amount > 0) out.push(`${t("Stones")}: ${rs(tt.stone_amount)}`);
    if (tt.huid_amount > 0) out.push(`HUID (${tt.huid_pieces}): ${rs(tt.huid_amount)}`);
    if (tt.total_charges > 0) out.push(`${t("Other charges")}: ${rs(tt.total_charges)}`);
    if (tt.tax_type === "INTER") out.push(`IGST ${q.gst}%: ${rs(tt.igst_amount)}`);
    else if (tt.gst_amount > 0) out.push(`GST ${q.gst}%: ${rs(tt.gst_amount)}`);
    if (Number(tt.round_off)) out.push(`${t("Round off")}: ${rs(tt.round_off)}`);
    out.push(`*${t("Total")}: ${rs(tt.grand_total)}*`);
    if (q.problems?.length) out.push(`_${t("Not priced yet")}: ${q.problems.map((p) => p.code).join(", ")}_`);
    out.push("");
    out.push(q.estimate?.valid_until
      ? `_${t("Rate valid till {d}.", { d: new Date(q.estimate.valid_until).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) })}_`
      : `_${t("Rate valid for today only.")}_`);
  } else if (result.title === "Quick math") {
    out.push(`*${t("Calculation")}* · ${today()}`);
    if (shop) out.push(`${t("To")}: ${shop.name}`);
    out.push(`${result.total[0]} = *${result.total[1]}*`);
  } else {
    out.push(`*${t(result.title)}* · ${today()}`);
    if (shop) out.push(`${t("To")}: ${shop.name}`);
    out.push(LINE);
    result.rows.forEach(([k, v, sub]) => out.push(`${t(k)}: ${v}${sub ? ` (${sub})` : ""}`));
    out.push(`*${t(result.total[0])}: ${result.total[1]}*${result.total[2] ? ` (${result.total[2]})` : ""}`);
  }
  if (biz?.phone || biz?.name) {
    out.push("");
    out.push([biz?.name, biz?.phone && `📞 ${biz.phone}`].filter(Boolean).join(" · "));
  }
  return out.join("\n");
}

/** The message as a clean picture (for a WhatsApp status or a group). */
async function sharePicture(message, title) {
  const lines = message.split("\n");
  const W = 1080;
  const wrap = (s) => {
    const out = [];
    let cur = "";
    s.split(" ").forEach((w) => {
      if ((cur + " " + w).trim().length > 46) {
        out.push(cur);
        cur = w;
      } else cur = (cur + " " + w).trim();
    });
    out.push(cur);
    return out;
  };
  const drawn = lines.flatMap((l) => wrap(l).map((p) => ({ text: p, bold: /^\*.*\*$/.test(l.trim()) || /^\*/.test(l.trim()) })));
  const H = 120 + drawn.length * 52 + 60;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const x = c.getContext("2d");
  x.fillStyle = "#fffaf3";
  x.fillRect(0, 0, W, H);
  x.fillStyle = "#9f1239";
  x.fillRect(0, 0, W, 16);
  drawn.forEach((d, i) => {
    const y = 110 + i * 52;
    x.fillStyle = d.text.startsWith("────") ? "#d6cfc4" : "#111827";
    x.font = `${d.bold ? "bold " : ""}36px Poppins, system-ui, sans-serif`;
    x.fillText(d.text.replace(/[*_]/g, ""), 70, y);
  });
  const blob = await new Promise((ok) => c.toBlob(ok, "image/png"));
  const file = new File([blob], "quotation.png", { type: "image/png" });
  try {
    if (navigator.canShare?.({ files: [file] })) return await navigator.share({ files: [file], text: title });
  } catch {
    return;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Preview before sending: the owner can tweak the words, pick the shop's number, then send. */
export function ShareDialog({ open, onClose, result, biz, shop, onSent }) {
  const { t } = useT();
  const [items, setItems] = useState(true);
  const [showRate, setShowRate] = useState(true);
  const [text, setText] = useState("");
  const [note, setNote] = useState(() => {
    try {
      return localStorage.getItem("share.note") || "";
    } catch {
      return "";
    }
  });
  const keepNote = (v) => {
    setNote(v);
    try {
      localStorage.setItem("share.note", v);
    } catch {}
  };
  const [phone, setPhone] = useState("");
  const [copied, setCopied] = useState(false);
  const isQuote = !!result?.quote;

  useEffect(() => {
    if (open && result) setText(buildMessage({ result, biz, shop, t, items, showRate, note }));
  }, [open, result, biz, shop, items, showRate, note]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (open) setPhone(shop?.phone || "");
  }, [open, shop]);
  if (!open || !result) return null;

  const to = waNumber(phone);
  const link = `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={t("Send on WhatsApp")} onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-surface shadow-2xl sm:max-w-lg sm:rounded-2xl">
        <header className="flex items-center gap-2 border-b border-line px-4 py-3">
          <MessageCircle size={18} className="text-green-600" aria-hidden />
          <h2 className="flex-1 font-semibold">{isQuote ? t("Send quotation") : t("Send on WhatsApp")}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-canvas" aria-label={t("Close")}><X size={18} /></button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          <Field label={t("Your message")} hint={t("Goes at the top, e.g. Vanakkam, here is today's quote. Remembered for next time.")}>
            <textarea value={note} onChange={(e) => keepNote(e.target.value)} rows={2} maxLength={500}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent" />
          </Field>
          <div className="flex flex-wrap gap-4 text-sm">
            {isQuote && (
              <label className="flex items-center gap-2"><input type="checkbox" checked={items} onChange={(e) => setItems(e.target.checked)} className="h-4 w-4" /> {t("Show each item")}</label>
            )}
            {isQuote && (
              <label className="flex items-center gap-2"><input type="checkbox" checked={showRate} onChange={(e) => setShowRate(e.target.checked)} className="h-4 w-4" /> {t("Show gold rate")}</label>
            )}
          </div>
          {/* WhatsApp-like preview, editable */}
          <div className="rounded-xl bg-[#e5ddd5] p-3">
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={Math.min(18, text.split("\n").length + 1)}
              className="w-full resize-y rounded-lg bg-[#dcf8c6] px-3 py-2 font-mono text-[13px] leading-snug text-black shadow-sm outline-none"
              aria-label={t("Message")} />
          </div>
          <Field label={t("Shop's WhatsApp number")} hint={to ? t("Opens the chat with this number.") : t("Leave empty to choose the chat in WhatsApp.")}>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="98400 98400" />
          </Field>
        </div>
        <footer className="flex flex-wrap gap-2 border-t border-line px-4 py-3">
          <a href={link} target="_blank" rel="noopener noreferrer" onClick={() => { onSent?.(); onClose(); }}
            className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-green-600 px-4 text-sm font-semibold text-white hover:bg-green-700">
            <MessageCircle size={16} aria-hidden /> {t("Send on WhatsApp")}
          </a>
          <Button variant="ghost" className="h-10" onClick={copy}><Copy size={15} aria-hidden /> {copied ? t("Copied") : t("Copy")}</Button>
          <Button variant="ghost" className="h-10" onClick={() => sharePicture(text, biz?.name || t("Quotation"))}><ImageIcon size={15} aria-hidden /> {t("Picture")}</Button>
        </footer>
      </div>
    </div>
  );
}
