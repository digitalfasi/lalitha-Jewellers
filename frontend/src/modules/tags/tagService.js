import { api } from "@/_shared/api/client";

export const tagService = {
  resolve: (code) => api(`/tags/resolve/${encodeURIComponent(code.trim())}`),
  // expandCombos: a combo code becomes its pieces' tags (for fold-over tags).
  labels: (codes, expandCombos = false) => api("/tags/labels", { method: "POST", body: { codes, expand_combos: expandCombos } }),
  pending: () => api("/tags/pending"),
  markPrinted: async (codes) => {
    const out = await api("/tags/printed", { method: "POST", body: { codes } });
    if (typeof window !== "undefined") window.dispatchEvent(new Event("tags:changed"));
    return out;
  },
};

// Physical label sizes, in millimetres (one face). A fold-over tag is two faces wide.
// "sheet" prints many per A4 page; "roll" prints one label per page for a label printer.
export const LABEL_SIZES = {
  small: { name: "Small 50 × 25 mm", w: 50, h: 25 },
  large: { name: "Large 75 × 40 mm", w: 75, h: 40 },
};

export const TAG_STYLES = {
  fold: "Fold-over: piece front, set back",
  single: "Single side",
};

const PREFS_KEY = "tags.prefs";
const DEFAULT_PREFS = { size: "small", layout: "sheet", style: "fold" };

// Label size / printer / style, remembered in this browser (per-device setting).
export function getTagPrefs() {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function setTagPrefs(prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore: falls back to defaults next time */
  }
}

/** CSS @page rule for a print run. */
export function pageRule({ size, layout, style }) {
  const { w, h } = LABEL_SIZES[size];
  return layout === "roll" ? `@page { size: ${style === "fold" ? w * 2 : w}mm ${h}mm; margin: 0; }` : "@page { size: A4; margin: 8mm; }";
}
