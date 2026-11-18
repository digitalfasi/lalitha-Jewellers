import { api, upload } from "@/_shared/api/client";

const qs = (params) => {
  const s = new URLSearchParams(
    Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null && v !== ""),
  ).toString();
  return s ? `?${s}` : "";
};

export const inventoryService = {
  listCategories: () => api("/inventory/categories"),
  createCategory: (body) => api("/inventory/categories", { method: "POST", body }),
  updateCategory: (id, body) => api(`/inventory/categories/${id}`, { method: "PATCH", body }),

  listDesigns: (categoryId) => api(`/inventory/designs${qs({ category_id: categoryId })}`),
  createDesign: (body) => api("/inventory/designs", { method: "POST", body }),
  updateDesign: (id, body) => api(`/inventory/designs/${id}`, { method: "PATCH", body }),

  listPieces: (filters) => api(`/inventory/pieces${qs(filters)}`),
  getPieceByCode: (code) => api(`/inventory/pieces/by-code/${encodeURIComponent(code)}`),
  createPiece: (body) => api("/inventory/pieces", { method: "POST", body }),
  updatePiece: (id, body) => api(`/inventory/pieces/${id}`, { method: "PATCH", body }),
  createPiecesBulk: (body) => api("/inventory/pieces/bulk", { method: "POST", body }),
  uploadPhoto: (id, file) => upload(`/inventory/pieces/${id}/photo`, file),
  removePhoto: (id) => api(`/inventory/pieces/${id}/photo`, { method: "DELETE" }),

  listKarigars: (includeInactive) => api(`/inventory/karigars${qs({ include_inactive: includeInactive })}`),
  createKarigar: (body) => api("/inventory/karigars", { method: "POST", body }),
  updateKarigar: (id, body) => api(`/inventory/karigars/${id}`, { method: "PUT", body }),
  listLots: (params) => api(`/inventory/lots${qs(params)}`),
  getLot: (id) => api(`/inventory/lots/${id}`),
  createLot: (body) => api("/inventory/lots", { method: "POST", body }),
  updateLot: (id, body) => api(`/inventory/lots/${id}`, { method: "PATCH", body }),

  // Everything that has happened to one piece: combos it was in, bills it was on.
  pieceCombos: (code) => api(`/combos/piece-history/${encodeURIComponent(code)}`),
  pieceBills: (code) => api(`/billing/piece-bills/${encodeURIComponent(code)}`),
};

export const PURITIES = ["24K", "22K", "20K", "18K", "14K"];

export const STATUS_LABEL = { IN_STOCK: "In stock", SOLD: "Sold", INACTIVE: "Inactive" };

export const grams = (n) => (n === null || n === undefined ? "—" : Number(n).toFixed(3));
