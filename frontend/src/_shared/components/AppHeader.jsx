"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { ROLE_LABEL, useAuth } from "@/_shared/auth/AuthProvider";
import GoldRateBadge from "./GoldRateBadge";
import HealthBadge from "./HealthBadge";
import ScanBox from "./ScanBox";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/inventory", label: "Inventory" },
  { href: "/combos", label: "Combos" },
  { href: "/billing", label: "Billing" },
  { href: "/tags", label: "Tags" },
  { href: "/audit", label: "Stock count" },
  { href: "/catalogue", label: "Catalogue" },
  { href: "/settings", label: "Settings" },
];

export default function AppHeader() {
  const path = usePathname();
  const { user, signOut } = useAuth();
  return (
    <header className="no-print border-b border-line bg-surface">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Link href="/" className="font-bold">DFX Wholesale</Link>
          <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={clsx((l.href === "/" ? path === "/" : path.startsWith(l.href)) ? "font-semibold text-accent" : "text-muted hover:text-ink")}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ScanBox />
          <GoldRateBadge />
          <HealthBadge />
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-lg border border-line px-2.5 py-1 text-sm hover:bg-canvas">
              {user.full_name} <span className="text-xs text-muted">· {ROLE_LABEL[user.role]}</span>
            </summary>
            <div className="absolute right-0 z-30 mt-1 w-48 rounded-lg border border-line bg-surface p-1 text-sm shadow-lg">
              <Link href="/settings?tab=password" className="block rounded px-3 py-2 hover:bg-canvas">Change password</Link>
              <button onClick={signOut} className="block w-full rounded px-3 py-2 text-left text-red-700 hover:bg-canvas">
                Sign out
              </button>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
