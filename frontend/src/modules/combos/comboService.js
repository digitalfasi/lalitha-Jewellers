import { api, upload } from "@/_shared/api/client";

const qs = (params) => {
  const s = new URLSearchParams(
    Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null && v !== ""),
  ).toString();
  return s ? `?${s}` : "";
};

export const comboService = {
  list: (filters) => api(`/combos${qs(filters)}`),
  get: (id) => api(`/combos/${id}`),
  getByCode: (code) => api(`/combos/by-code/${encodeURIComponent(code)}`),
  create: (body) => api("/combos", { method: "POST", body }),
  // New stock arriving as a set: its pieces and the combo in one save.
  createSet: (body) => api("/combos/new-set", { method: "POST", body }),
  update: (id, body) => api(`/combos/${id}`, { method: "PATCH", body }),
  link: (id, piece_code, note) => api(`/combos/${id}/link`, { method: "POST", body: { piece_code, note } }),
  unlink: (id, piece_code, note) => api(`/combos/${id}/unlink`, { method: "POST", body: { piece_code, note } }),
  swap: (id, out_code, in_code, note) => api(`/combos/${id}/swap`, { method: "POST", body: { out_code, in_code, note } }),
  dissolve: (id, note) => api(`/combos/${id}/dissolve`, { method: "POST", body: { note } }),
  history: (id) => api(`/combos/${id}/history`),
  pieceHistory: (code) => api(`/combos/piece-history/${encodeURIComponent(code)}`),
  availablePieces: (q, limit = 20, categoryId) => api(`/combos/available-pieces${qs({ q, limit, category_id: categoryId })}`),
  // Free pieces ranked as a match for the ones already chosen.
  suggestions: (codes, categoryId, limit = 8) =>
    api(`/combos/suggestions${qs({ with_codes: codes.join(","), category_id: categoryId, limit })}`),
  templates: (includeInactive) => api(`/combos/templates${qs({ include_inactive: includeInactive })}`),
  createTemplate: (body) => api("/combos/templates", { method: "POST", body }),
  updateTemplate: (id, body) => api(`/combos/templates/${id}`, { method: "PUT", body }),
  uploadPhoto: (id, file) => upload(`/combos/${id}/photo`, file),
  removePhoto: (id) => api(`/combos/${id}/photo`, { method: "DELETE" }),
};

/** "Rope chain" from design Rope + category Chain (same rule as the server). */
export const shortName = (p) => (p.design_name ? `${p.design_name} ${p.category_name.toLowerCase()}` : p.name);

export const COMBO_STATUS_LABEL = { ACTIVE: "Active", DISSOLVED: "Dissolved", SOLD: "Sold" };

export const when = (iso) =>
  new Date(iso.endsWith("Z") || iso.includes("+") ? iso : `${iso}Z`).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
