import { useEffect, useState } from "react";
import { api } from "@/_shared/api/client";

// The calculator asks the server, which uses the same sums and rounding as the bills.
export const calcService = {
  fine: (body) => api("/calc/fine", { method: "POST", body }),
  rates: (fineRate) => api(`/calc/rates?fine_rate=${encodeURIComponent(fineRate)}`),
  gst: (body) => api("/calc/gst", { method: "POST", body }),
  oldGold: (body) => api("/calc/old-gold", { method: "POST", body }),
  moneyToGold: (body) => api("/calc/money-to-gold", { method: "POST", body }),
  metalAccount: (body) => api("/calc/metal-account", { method: "POST", body }),
  quote: (body) => api("/billing/quote", { method: "POST", body }),
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

const inrFmt = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const rs = (v) =>
  v === null || v === undefined ? "—" : `${Number(v) < 0 ? "−" : ""}₹${inrFmt.format(Math.abs(Number(v)))}`;
export const g3 = (v) => (v === null || v === undefined ? "—" : `${Number(v).toFixed(3)} g`);
export const pv = (v) => (v === null || v === undefined ? "" : `${Number(v).toFixed(3)} pavan`);
