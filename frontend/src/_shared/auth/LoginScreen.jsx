"use client";

import { useState } from "react";
import { api } from "@/_shared/api/client";
import { Button, Card, Field, Input, Notice } from "@/_shared/components/ui";

// Sign-in, or first-time setup (creates the owner) when the app has no users yet.
export default function LoginScreen({ setup, notice, onSignedIn, onRetry }) {
  const [form, setForm] = useState({ username: "", full_name: "", password: "", confirm: "" });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (setup && form.password !== form.confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      const out = setup
        ? await api("/auth/setup", { method: "POST", body: { username: form.username, full_name: form.full_name, password: form.password } })
        : await api("/auth/login", { method: "POST", body: { username: form.username, password: form.password } });
      onSignedIn(out);
    } catch (err) {
      setError(err.status === 0 ? "Can't reach the server. Is the backend running?" : err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <Card className="w-full max-w-sm p-6">
        <h1 className="text-xl font-bold">DFX Wholesale</h1>
        <p className="mb-5 text-sm text-muted">
          {setup ? "First-time setup: create the owner's account." : "Sign in to continue."}
        </p>
        <form onSubmit={submit} className="flex flex-col gap-3">
          {notice && !error && <Notice tone="error">{notice}</Notice>}
          <Field label="Username" hint={setup ? "Small letters, digits, . _ -" : undefined}>
            <Input value={form.username} onChange={set("username")} autoComplete="username" autoFocus required
              autoCapitalize="none" pattern={setup ? "[a-z0-9._-]{3,50}" : undefined} />
          </Field>
          {setup && (
            <Field label="Your name">
              <Input value={form.full_name} onChange={set("full_name")} required minLength={2} maxLength={100} />
            </Field>
          )}
          <Field label="Password" hint={setup ? "At least 8 characters" : undefined}>
            <Input type="password" value={form.password} onChange={set("password")} required
              autoComplete={setup ? "new-password" : "current-password"} minLength={setup ? 8 : 1} maxLength={72} />
          </Field>
          {setup && (
            <Field label="Password again">
              <Input type="password" value={form.confirm} onChange={set("confirm")} required autoComplete="new-password" />
            </Field>
          )}
          {error && <Notice tone="error">{error}</Notice>}
          <Button type="submit" disabled={busy} className="mt-1">
            {busy ? "Please wait…" : setup ? "Create owner and sign in" : "Sign in"}
          </Button>
          {notice && error?.startsWith("Can't reach") && (
            <Button type="button" variant="ghost" onClick={onRetry}>Try again</Button>
          )}
        </form>
      </Card>
    </div>
  );
}
