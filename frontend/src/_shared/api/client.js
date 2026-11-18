// Single fetch wrapper for the backend. Every module service calls this, so
// base URL, sign-in token, JSON handling and error shape live in one place.
const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
// Photos and the logo are served by the backend at /uploads/... (outside /api/v1).
const ORIGIN = BASE_URL.replace(/\/api\/v1\/?$/, "");
const TOKEN_KEY = "wholesale.token";

export class ApiError extends Error {
  constructor(message, { status, code } = {}) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode: the sign-in lasts until the tab closes */
  }
}

/** Full URL for a backend-served file such as "/uploads/pieces/ab.jpg". */
export function mediaUrl(path) {
  return path ? `${ORIGIN}${path}` : null;
}

async function send(path, { method = "GET", body, headers } = {}) {
  const token = getToken();
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  try {
    return await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        ...(isForm || body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Cannot reach the server", { status: 0, code: "NETWORK" });
  }
}

async function fail(res) {
  const data = await res.json().catch(() => null);
  const err = data?.error || {};
  if (res.status === 401 && getToken()) {
    // A sign-in that expired: the auth provider shows the sign-in screen again.
    setToken(null);
    if (typeof window !== "undefined") window.dispatchEvent(new Event("auth:expired"));
  }
  throw new ApiError(err.message || data?.detail || `Request failed (${res.status})`, {
    status: res.status,
    code: err.code,
  });
}

export async function api(path, options) {
  const res = await send(path, options);
  if (!res.ok) await fail(res);
  if (res.status === 204) return null;
  return res.json().catch(() => null);
}

/** For files the API returns (bill PDF). */
export async function apiBlob(path) {
  const res = await send(path);
  if (!res.ok) await fail(res);
  return res.blob();
}

/** Upload one file as multipart form field "file". */
export function upload(path, file) {
  const form = new FormData();
  form.append("file", file);
  return api(path, { method: "POST", body: form });
}
