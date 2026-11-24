import { useEffect, useState } from "react";
import { api, upload } from "@/_shared/api/client";

// The calculator asks the server, which uses the same sums and rounding as the bills.
export const calcService = {
  fine: (body) => api("/calc/fine", { method: "POST", body }),
  rates: (fineRate) => api(`/calc/rates?fine_rate=${encodeURIComponent(fineRate)}`),
  gst: (body) => api("/calc/gst", { method: "POST", body }),
  oldGold: (body) => api("/calc/old-gold", { method: "POST", body }),
  moneyToGold: (body) => api("/calc/money-to-gold", { method: "POST", body }),
  metalAccount: (body) => api("/calc/metal-account", { method: "POST", body }),
  // Quick math (Excel style). Math errors come back as {status: "error", error: "#DIV/0!"}.
  presets: () => api("/calc/presets"),
  formula: (formula, values) => api("/calc/formula", { method: "POST", body: { formula, values } }),
  grid: (a, b) => api("/calc/grid", { method: "POST", body: { a, b } }),
  stats: (text) => api("/calc/stats", { method: "POST", body: { text } }),
  savedFormulas: () => api("/calc/formulas"),
  saveFormula: (body) => api("/calc/formulas", { method: "POST", body }),
  deleteFormula: (id) => api(`/calc/formulas/${id}`, { method: "DELETE" }),
  editFormula: (id, body) => api(`/calc/formulas/${id}`, { method: "PATCH", body }),
  undoFormula: (id) => api(`/calc/formulas/${id}/undo`, { method: "POST" }),
  importExcel: (file) => upload("/calc/import-excel", file),
  sheet: (cells) => api("/calc/sheet", { method: "POST", body: { cells } }),
  // This person's tape, sheet and pins, on every device.
  me: () => api("/calc/me"),
  saveMe: (body) => api("/calc/me", { method: "PUT", body }),
  shopRecent: (shopId) => api(`/billing/shops/${shopId}/recent`),
  // Named sheets and recent quotes / sums, saved on the server.
  items: (kind, q) => api(`/calc/items?kind=${kind}${q ? `&q=${encodeURIComponent(q)}` : ""}`),
  item: (id) => api(`/calc/items/${id}`),
  saveItem: (id, body) => api(`/calc/items/${id}`, { method: "PUT", body }),
  deleteItem: (id) => api(`/calc/items/${id}`, { method: "DELETE" }),
};

/** A number from a text box, or null when empty / not a number. */
export const num = (v) => {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Ask the server once the inputs settle (300 ms); an answer for old inputs is dropped.
 *  `run` is null while the inputs aren't complete. */
export function useLive(run, deps) {
  const [state, setState] = useState({ res: null, error: null });
  useEffect(() => {
    if (!run) {
      setState({ res: null, error: null });
      return;
    }
    let live = true;
    const timer = setTimeout(() => {
      run()
        .then((res) => live && setState({ res, error: null }))
        .catch((e) => live && setState({ res: null, error: e.message }));
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}

// Values typed in the calculator survive closing the panel (for this browser tab only).
const PERSIST = "calc.v1.";
export function usePersist(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const saved = sessionStorage.getItem(PERSIST + key);
      return saved ? { ...initial, ...JSON.parse(saved) } : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(PERSIST + key, JSON.stringify(value));
    } catch {}
  }, [key, value]);
  return [value, setValue];
}
export function clearPersist(key) {
  try {
    sessionStorage.removeItem(PERSIST + key);
  } catch {}
}

// The last 10 kept answers, on this device.
const HISTORY = "calc.history";
export const history = {
  list() {
    try {
      return JSON.parse(localStorage.getItem(HISTORY)) || [];
    } catch {
      return [];
    }
  },
  add(item) {
    const next = [{ ...item, at: new Date().toISOString() }, ...history.list()].slice(0, 10);
    try {
      localStorage.setItem(HISTORY, JSON.stringify(next));
    } catch {}
    return next;
  },
  clear() {
    try {
      localStorage.removeItem(HISTORY);
    } catch {}
  },
};

const inrFmt = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const rs = (v) =>
  v === null || v === undefined ? "—" : `${Number(v) < 0 ? "−" : ""}₹${inrFmt.format(Math.abs(Number(v)))}`;
export const g3 = (v) => (v === null || v === undefined ? "—" : `${Number(v).toFixed(3)} g`);
export const pv = (v) => (v === null || v === undefined ? "" : `${Number(v).toFixed(3)} pavan`);
export const w3 = (v) => Number(v).toFixed(3);
export const pc = (v) => `${Number(v)}%`;
export const GRAMS_PER_PAVAN = 8;
