import { api } from "@/_shared/api/client";

export const auditService = {
  list: () => api("/audits"),
  start: (body) => api("/audits", { method: "POST", body }),
  get: (id) => api(`/audits/${id}`),
  scan: (id, code) => api(`/audits/${id}/scan`, { method: "POST", body: { code } }),
  undo: (id, scanId) => api(`/audits/${id}/scans/${scanId}`, { method: "DELETE" }),
  close: (id) => api(`/audits/${id}/close`, { method: "POST" }),
};

export const RESULT_LABEL = {
  FOUND: "Counted",
  NOT_IN_STOCK: "Sold / retired but on the shelf",
  UNKNOWN: "Unknown code",
  OTHER_CATEGORY: "Not in this count",
};
