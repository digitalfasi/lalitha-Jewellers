"use client";

import clsx from "clsx";

const PURITY_BUTTON = {
  "24K": "bg-yellow-300 text-yellow-950",
  "22K": "bg-amber-200 text-amber-950",
  "20K": "bg-yellow-100 text-yellow-900",
  "18K": "bg-orange-200 text-orange-950",
  "14K": "bg-stone-200 text-stone-800",
};

// Purity as big coloured buttons instead of a dropdown: one tap, easy to see.
export function PurityPicker({ value, onChange, options }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup">
      {options.map((p) => (
        <button key={p} type="button" role="radio" aria-checked={value === p} onClick={() => onChange(p)}
          className={clsx("h-9 min-w-12 rounded-lg px-2 text-sm font-bold tabular-nums ring-offset-1 transition",
            PURITY_BUTTON[p], value === p ? "ring-2 ring-accent" : "opacity-50 hover:opacity-90")}>
          {p}
        </button>
      ))}
    </div>
  );
}

/**
 * "Does this look right?" checks before saving a piece. Returns plain sentences.
 * design (optional) carries typical_net / usual_touch learned from earlier pieces.
 */
export function weightWarnings({ gross, stone, touch, design, t }) {
  const out = [];
  const net = gross - (stone || 0);
  if (stone > 0 && stone > gross / 2) out.push(t("Stone is more than half of the gross weight."));
  if (design?.typical_net && design.piece_count >= 2 && net > 0) {
    const ratio = net / design.typical_net;
    if (ratio > 3 || ratio < 1 / 3) {
      out.push(t("Net {net} g is far from the usual {usual} g for {design}.", { net: net.toFixed(3), usual: design.typical_net.toFixed(3), design: design.name }));
    }
  }
  if (touch != null) {
    if (touch < 50 || touch > 125) out.push(t("Touch {touch}% is unusual.", { touch }));
    else if (design?.usual_touch != null && Math.abs(touch - design.usual_touch) > 8) {
      out.push(t("Touch {touch}% is different from the usual {usual}% for {design}.", { touch, usual: design.usual_touch, design: design.name }));
    }
  }
  if (gross > 500) out.push(t("Gross weight is over 500 g."));
  return out;
}
