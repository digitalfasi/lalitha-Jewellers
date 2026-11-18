"use client";

import { useState } from "react";
import { Button, Card, Field, Input, Notice } from "@/_shared/components/ui";
import { settingsService } from "./settingsService";

export default function PasswordTab() {
  const [form, setForm] = useState({ current: "", next: "", again: "" });
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);

  const save = async (e) => {
    e.preventDefault();
    setError(null);
    if (form.next !== form.again) return setError("The two new passwords don't match.");
    try {
      await settingsService.changePassword({ current_password: form.current, new_password: form.next });
      setForm({ current: "", next: "", again: "" });
      setMsg("Password changed.");
    } catch (err) {
      setError(err.message);
    }
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return (
    <Card className="max-w-sm p-5">
      <form onSubmit={save} className="flex flex-col gap-3">
        <Field label="Current password"><Input type="password" value={form.current} onChange={set("current")} required autoComplete="current-password" /></Field>
        <Field label="New password" hint="At least 8 characters"><Input type="password" value={form.next} onChange={set("next")} required minLength={8} maxLength={72} autoComplete="new-password" /></Field>
        <Field label="New password again"><Input type="password" value={form.again} onChange={set("again")} required autoComplete="new-password" /></Field>
        {msg && <Notice onClose={() => setMsg(null)}>{msg}</Notice>}
        {error && <Notice tone="error" onClose={() => setError(null)}>{error}</Notice>}
        <Button type="submit">Change password</Button>
      </form>
    </Card>
  );
}
