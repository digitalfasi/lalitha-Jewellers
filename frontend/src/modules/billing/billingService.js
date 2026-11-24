import { api, apiBlob } from "@/_shared/api/client";

const qs = (params) => {
  const s = new URLSearchParams(
    Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null && v !== ""),
  ).toString();
  return s ? `?${s}` : "";
};

export const billingService = {
  listShops: (params) => api(`/billing/shops${qs(params)}`),
  createShop: (body) => api("/billing/shops", { method: "POST", body }),
  updateShop: (id, body) => api(`/billing/shops/${id}`, { method: "PATCH", body }),

  quote: (draft) => api("/billing/quote", { method: "POST", body: draft }),
  createBill: (draft) => api("/billing/bills", { method: "POST", body: draft }),
  // Bills being made, saved to finish later (nothing is sold until the bill is saved).
  drafts: () => api("/billing/drafts"),
  saveDraft: (id, body) => api(`/billing/drafts/${id}`, { method: "PUT", body }),
  deleteDraft: (id) => api(`/billing/drafts/${id}`, { method: "DELETE" }),
  listBills: (params) => api(`/billing/bills${qs(params)}`),
  getBill: (id) => api(`/billing/bills/${id}`),
  cancelBill: (id, reason) => api(`/billing/bills/${id}/cancel`, { method: "POST", body: { reason } }),
  billPdf: (id) => apiBlob(`/billing/bills/${id}/pdf`),
  emailBill: (id, to, message) => api(`/billing/bills/${id}/email`, { method: "POST", body: { to, message: message || null } }),
  pieceBills: (code) => api(`/billing/piece-bills/${encodeURIComponent(code)}`),

  quickQuote: (body) => api("/billing/quick-quote", { method: "POST", body }),
  createEstimate: (body) => api("/billing/estimates", { method: "POST", body }),
  listEstimates: (params) => api(`/billing/estimates${qs(params)}`),
  getEstimate: (id) => api(`/billing/estimates/${id}`),
  goldAccount: (shopId) => api(`/billing/shops/${shopId}/gold`),
  addGold: (shopId, body) => api(`/billing/shops/${shopId}/gold`, { method: "POST", body }),
  removeGold: (shopId, entryId) => api(`/billing/shops/${shopId}/gold/${entryId}`, { method: "DELETE" }),
  profit: (params) => api(`/reports/profit${qs(params)}`),
};

const inrFmt = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const inr = (n) => (n === null || n === undefined ? "—" : `₹${inrFmt.format(n)}`);
export const num2 = (n) => (n === null || n === undefined ? "—" : inrFmt.format(n));
export const pct = (n) => (n === null || n === undefined ? "—" : `${Number(n).toFixed(2).replace(/\.?0+$/, "")}%`);

export const today = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export const fmtDate = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
