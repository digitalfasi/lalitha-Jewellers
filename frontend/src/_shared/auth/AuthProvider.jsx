"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, getToken, setToken } from "@/_shared/api/client";
import LoginScreen from "./LoginScreen";

const AuthContext = createContext(null);

export const isOwner = (u) => u?.role === "OWNER";
export const isManager = (u) => u?.role === "OWNER" || u?.role === "MANAGER";
export const ROLE_LABEL = { OWNER: "Owner", MANAGER: "Manager", STAFF: "Staff" };

export function useAuth() {
  return useContext(AuthContext);
}

// Wraps the whole app: nothing but the sign-in screen shows until someone is
// signed in. A 401 from any API call (expired sign-in) brings it back.
export default function AuthProvider({ children }) {
  const [state, setState] = useState({ loading: true, user: null, needsSetup: false, error: null });

  const load = useCallback(async () => {
    try {
      if (getToken()) {
        const user = await api("/auth/me");
        setState({ loading: false, user, needsSetup: false, error: null });
        return;
      }
      const { needs_setup } = await api("/auth/status");
      setState({ loading: false, user: null, needsSetup: needs_setup, error: null });
    } catch (e) {
      if (e.status === 401 || e.status === 403) {
        setToken(null);
        const status = await api("/auth/status").catch(() => ({ needs_setup: false }));
        setState({ loading: false, user: null, needsSetup: status.needs_setup, error: e.status === 403 ? e.message : null });
      } else {
        setState({ loading: false, user: null, needsSetup: false, error: e.message });
      }
    }
  }, []);

  useEffect(() => {
    load();
    const expired = () => setState((s) => ({ ...s, user: null, error: "Your sign-in has expired. Please sign in again." }));
    window.addEventListener("auth:expired", expired);
    return () => window.removeEventListener("auth:expired", expired);
  }, [load]);

  const signedIn = (tokenOut) => {
    setToken(tokenOut.access_token);
    setState({ loading: false, user: tokenOut.user, needsSetup: false, error: null });
  };

  const signOut = () => {
    setToken(null);
    setState({ loading: false, user: null, needsSetup: false, error: null });
  };

  if (state.loading) return <p className="p-8 text-sm text-muted">Loading…</p>;
  if (!state.user) {
    return <LoginScreen setup={state.needsSetup} notice={state.error} onSignedIn={signedIn} onRetry={load} />;
  }
  return <AuthContext.Provider value={{ user: state.user, signOut, refresh: load }}>{children}</AuthContext.Provider>;
}
