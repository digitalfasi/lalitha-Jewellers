"use client";

import { useEffect, useRef, useState } from "react";
import { mediaUrl } from "@/_shared/api/client";
import { Button, Card, Field, Input, Notice, Select } from "@/_shared/components/ui";
import { STATE_OPTIONS } from "@/_shared/gstStates";
import { settingsService } from "./settingsService";

const FIELDS = ["name", "address", "city", "pincode", "state_code", "gstin", "pan", "phone", "email",
  "bank_name", "bank_account", "bank_ifsc", "bank_branch", "bill_terms"];

// The wholesaler's own details, printed at the top and bottom of every bill.
export default function BusinessTab({ canEdit }) {
  const [form, setForm] = useState(null);
  const [biz, setBiz] = useState(null);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const fill = (b) => {
    setBiz(b);
    setForm(Object.fromEntries(FIELDS.map((k) => [k, b[k] || ""])));
  };
  useEffect(() => {
    settingsService.business().then(fill).catch((e) => setError(e.message));
  }, []);

  if (!form) return error ? <Notice tone="error">{error}</Notice> : <p className="text-sm text-muted">Loading…</p>;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      fill(await settingsService.saveBusiness(form));
      setMsg("Saved. New bills will use these details; old bills keep theirs.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const onLogo = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    try {
      fill(await settingsService.uploadLogo(file));
      setMsg("Logo updated.");
    } catch (err) {
      setError(err.message);
    }
  };

  const ro = !canEdit;
  return (
    <form onSubmit={save} className="flex max-w-4xl flex-col gap-5">
      {!canEdit && <Notice tone="error">Only the owner can change business details.</Notice>}
      {!biz.is_set_up && canEdit && (
        <Notice tone="error">Bills print without a proper header until the business name and GSTIN are filled in.</Notice>
      )}

      <Card className="grid gap-4 p-5 sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">Business</h2>
        <Field label="Business name" className="sm:col-span-2">
          <Input value={form.name} onChange={set("name")} required minLength={2} disabled={ro} />
        </Field>
        <Field label="Address" className="sm:col-span-2">
          <Input value={form.address} onChange={set("address")} disabled={ro} />
        </Field>
        <Field label="City"><Input value={form.city} onChange={set("city")} disabled={ro} /></Field>
        <Field label="PIN code"><Input value={form.pincode} onChange={set("pincode")} inputMode="numeric" disabled={ro} /></Field>
        <Field label="GSTIN" hint="The state is taken from its first two digits">
          <Input value={form.gstin} onChange={set("gstin")} maxLength={15} className="font-mono uppercase" disabled={ro} />
        </Field>
        <Field label="State (for GST)">
          <Select value={form.state_code} onChange={set("state_code")} disabled={ro}>
            <option value="">—</option>
            {STATE_OPTIONS.map(([code, name]) => <option key={code} value={code}>{name} ({code})</option>)}
          </Select>
        </Field>
        <Field label="PAN"><Input value={form.pan} onChange={set("pan")} maxLength={10} className="font-mono uppercase" disabled={ro} /></Field>
        <Field label="Phone"><Input value={form.phone} onChange={set("phone")} disabled={ro} /></Field>
        <Field label="Email" className="sm:col-span-2"><Input type="email" value={form.email} onChange={set("email")} disabled={ro} /></Field>
      </Card>

      <Card className="grid gap-4 p-5 sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">Bank details (printed on bills)</h2>
        <Field label="Bank"><Input value={form.bank_name} onChange={set("bank_name")} disabled={ro} /></Field>
        <Field label="Branch"><Input value={form.bank_branch} onChange={set("bank_branch")} disabled={ro} /></Field>
        <Field label="Account number"><Input value={form.bank_account} onChange={set("bank_account")} className="font-mono" disabled={ro} /></Field>
        <Field label="IFSC"><Input value={form.bank_ifsc} onChange={set("bank_ifsc")} maxLength={11} className="font-mono uppercase" disabled={ro} /></Field>
        <Field label="Terms at the bottom of bills" className="sm:col-span-2">
          <textarea
            value={form.bill_terms}
            onChange={set("bill_terms")}
            rows={3}
            maxLength={2000}
            disabled={ro}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent disabled:bg-canvas"
          />
        </Field>
      </Card>

      <Card className="flex flex-wrap items-center gap-4 p-5">
        <div className="flex h-20 w-40 items-center justify-center rounded-lg border border-dashed border-line bg-canvas">
          {biz.logo_url ? <img src={mediaUrl(biz.logo_url)} alt="Logo" className="max-h-16 max-w-36 object-contain" /> : <span className="text-xs text-muted">No logo</span>}
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onLogo} />
            <Button type="button" variant="ghost" onClick={() => fileRef.current?.click()}>{biz.logo_url ? "Change logo" : "Upload logo"}</Button>
            {biz.logo_url && (
              <Button type="button" variant="ghost" onClick={async () => fill(await settingsService.removeLogo())}>Remove</Button>
            )}
          </div>
        )}
        <p className="text-xs text-muted">Printed at the top left of bills. PNG with a clear background looks best.</p>
      </Card>

      {msg && <Notice onClose={() => setMsg(null)}>{msg}</Notice>}
      {error && <Notice tone="error" onClose={() => setError(null)}>{error}</Notice>}
      {canEdit && <Button type="submit" disabled={busy} className="self-start">{busy ? "Saving…" : "Save business details"}</Button>}
      <p className="text-xs text-muted">Email for bills is {biz.email_enabled ? "switched on" : "not set up on the server yet (SMTP settings in the backend .env)"}.</p>
    </form>
  );
}
