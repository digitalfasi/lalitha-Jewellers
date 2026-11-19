"use client";

import { clsx as cx } from "clsx";
import { twMerge } from "tailwind-merge";
import { useT } from "@/_shared/i18n/LanguageProvider";

// Later classes win over earlier ones (w-56 beats the base w-full).
const clsx = (...args) => twMerge(cx(...args));

export function Button({ variant = "primary", className, ...props }) {
  return (
    <button
      {...props}
      className={clsx(
        "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-accent text-white hover:bg-accent/90",
        variant === "ghost" && "border border-line bg-surface hover:bg-canvas",
        variant === "link" && "h-auto px-0 text-accent hover:underline",
        className,
      )}
    />
  );
}

export function Field({ label, hint, error, children, className }) {
  return (
    <label className={clsx("flex flex-col gap-1 text-sm", className)}>
      <span className="font-medium">{label}</span>
      {children}
      {error ? <span className="text-xs text-red-700">{error}</span> : hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

const inputCls =
  "h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm outline-none focus:border-accent disabled:bg-canvas disabled:text-muted";

export function Input({ className, ...props }) {
  return <input {...props} className={clsx(inputCls, className)} />;
}

export function Select({ className, children, ...props }) {
  return (
    <select {...props} className={clsx(inputCls, "pr-8", className)}>
      {children}
    </select>
  );
}

export function Card({ className, children }) {
  return <div className={clsx("rounded-2xl border border-line bg-surface", className)}>{children}</div>;
}

export function Notice({ tone = "ok", children, onClose }) {
  if (!children) return null;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={clsx(
        "flex items-start justify-between gap-3 rounded-lg px-3 py-2 text-sm",
        tone === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800",
      )}
    >
      <span>{children}</span>
      {onClose && (
        <button onClick={onClose} className="text-xs opacity-70 hover:opacity-100" aria-label="Dismiss">
          ✕
        </button>
      )}
    </div>
  );
}

export function StatusPill({ status }) {
  const tone = {
    IN_STOCK: "bg-green-100 text-green-800",
    SOLD: "bg-line text-muted",
    INACTIVE: "bg-amber-100 text-amber-800",
  }[status];
  const { t } = useT();
  const label = { IN_STOCK: "In stock", SOLD: "Sold", INACTIVE: "Inactive" }[status] || status;
  return <span className={clsx("rounded-full px-2 py-0.5 text-xs font-medium", tone)}>{t(label)}</span>;
}

// Purity as a coloured badge, so it can be told apart at a glance without reading.
const PURITY_TONE = {
  "24K": "bg-yellow-300 text-yellow-950",
  "22K": "bg-amber-200 text-amber-950",
  "20K": "bg-yellow-100 text-yellow-900",
  "18K": "bg-orange-200 text-orange-950",
  "14K": "bg-stone-200 text-stone-800",
};

export function PurityBadge({ purity, className }) {
  if (!purity) return null;
  // A set can mix purities ("22K / 18K"): one badge each.
  return (
    <span className={clsx("inline-flex flex-wrap gap-1", className)}>
      {String(purity).split(" / ").map((p) => (
        <span key={p} className={clsx("rounded px-1.5 py-0.5 text-xs font-bold tabular-nums", PURITY_TONE[p] || "bg-line text-ink")}>{p}</span>
      ))}
    </span>
  );
}
