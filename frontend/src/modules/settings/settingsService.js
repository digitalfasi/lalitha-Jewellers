import { api, upload } from "@/_shared/api/client";

export const settingsService = {
  business: () => api("/business"),
  saveBusiness: (body) => api("/business", { method: "PUT", body }),
  uploadLogo: (file) => upload("/business/logo", file),
  removeLogo: () => api("/business/logo", { method: "DELETE" }),

  users: () => api("/auth/users"),
  createUser: (body) => api("/auth/users", { method: "POST", body }),
  updateUser: (id, body) => api(`/auth/users/${id}`, { method: "PATCH", body }),
  changePassword: (body) => api("/auth/me/password", { method: "POST", body }),

  rateToday: (on) => api(`/rates/today?on=${on}`),
  rates: (limit = 30) => api(`/rates?limit=${limit}`),
  setRate: (day, body) => api(`/rates/${day}`, { method: "PUT", body }),
};
