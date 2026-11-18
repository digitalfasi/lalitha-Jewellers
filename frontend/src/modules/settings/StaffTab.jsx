"use client";

import { useEffect, useState } from "react";
import { ROLE_LABEL } from "@/_shared/auth/AuthProvider";
import { Button, Card, Field, Input, Notice, Select } from "@/_shared/components/ui";
import { settingsService } from "./settingsService";

const ROLE_HELP = {
  OWNER: "Everything, including staff accounts and business details",
  MANAGER: "Cancel bills, dissolve combos, set the gold rate, retire pieces, close stock counts",
  STAFF: "Stock entry, combos, tags, bills, stock-count scanning",
};

const blank = { username: "", full_name: "", password: "", role: "STAFF" };

export default function StaffTab({ me }) {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(blank);
  const [reset, setReset] = useState(null); // {id, password}
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);

  const load = () => settingsService.users().then(setUsers).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  const run = async (fn, ok) => {
    setError(null);
    try {
      await fn();
      setMsg(ok);
      await load();
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    }
  };

  const add = async (e) => {
    e.preventDefault();
    if (await run(() => settingsService.createUser(form), `Account ${form.username} created. Give them the password you set.`)) {
      setForm(blank);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-canvas text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Role</th>
              <th className="px-4 py-2">Last sign-in</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={`border-b border-line align-top last:border-0 ${u.is_active ? "" : "opacity-50"}`}>
                <td className="px-4 py-2">
                  <div className="font-medium">{u.full_name}{u.id === me.id && <span className="text-xs text-muted"> (you)</span>}</div>
                  <div className="font-mono text-xs text-muted">{u.username}</div>
                </td>
                <td className="px-4 py-2">
                  <Select
                    value={u.role}
                    className="h-8 w-32"
                    onChange={(e) => run(() => settingsService.updateUser(u.id, { role: e.target.value }), `${u.full_name} is now ${ROLE_LABEL[e.target.value]}.`)}
                  >
                    {Object.keys(ROLE_LABEL).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </Select>
                </td>
                <td className="px-4 py-2 text-xs text-muted">{u.last_login_at ? new Date(u.last_login_at).toLocaleString("en-IN") : "Never"}</td>
                <td className="px-4 py-2 text-right">
                  {reset?.id === u.id ? (
                    <form
                      className="flex items-center justify-end gap-2"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (await run(() => settingsService.updateUser(u.id, { password: reset.password }), `New password set for ${u.full_name}.`)) setReset(null);
                      }}
                    >
                      <Input type="password" placeholder="New password" minLength={8} maxLength={72} className="h-8 w-36" autoFocus
                        value={reset.password} onChange={(e) => setReset({ ...reset, password: e.target.value })} required />
                      <Button type="submit" className="h-8">Set</Button>
                      <Button type="button" variant="link" onClick={() => setReset(null)}>Cancel</Button>
                    </form>
                  ) : (
                    <div className="flex justify-end gap-3">
                      <Button variant="link" onClick={() => setReset({ id: u.id, password: "" })}>Reset password</Button>
                      {u.id !== me.id && (
                        <Button variant="link" className={u.is_active ? "text-red-700" : ""}
                          onClick={() => run(() => settingsService.updateUser(u.id, { is_active: !u.is_active }),
                            `${u.full_name} ${u.is_active ? "can no longer sign in" : "can sign in again"}.`)}>
                          {u.is_active ? "Switch off" : "Switch on"}
                        </Button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 font-semibold">Add a staff member</h2>
        <form onSubmit={add} className="flex flex-col gap-3">
          <Field label="Name"><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required minLength={2} /></Field>
          <Field label="Username" hint="Small letters, digits, . _ -">
            <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })} required pattern="[a-z0-9._-]{3,50}" autoCapitalize="none" />
          </Field>
          <Field label="Password" hint="At least 8 characters. Tell them to change it.">
            <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} maxLength={72} autoComplete="new-password" />
          </Field>
          <Field label="Role" hint={ROLE_HELP[form.role]}>
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {Object.keys(ROLE_LABEL).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </Select>
          </Field>
          <Button type="submit">Add</Button>
        </form>
        <div className="mt-4 flex flex-col gap-2">
          {msg && <Notice onClose={() => setMsg(null)}>{msg}</Notice>}
          {error && <Notice tone="error" onClose={() => setError(null)}>{error}</Notice>}
        </div>
      </Card>
    </div>
  );
}
