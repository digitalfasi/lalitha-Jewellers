"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { Calculator as CalcIcon, Home, Images, Link2, Package, Receipt, ScanLine, Settings, Tag } from "lucide-react";
import { ROLE_LABEL, isManager, useAuth } from "@/_shared/auth/AuthProvider";
import { LanguageSwitch, useT } from "@/_shared/i18n/LanguageProvider";
import GoldRateBadge from "./GoldRateBadge";
import HealthBadge from "./HealthBadge";
import ScanBox from "./ScanBox";
import Calculator from "@/modules/calc/Calculator";
import { FEATURES } from "@/_shared/features";

// On phones the menu moves to a bar at the bottom (thumb reach), with the five
// most used screens; everything else is one tap away on Home.
const PHONE_BAR = ["/", "/inventory", "/billing", "/tags", FEATURES.stockCount ? "/audit" : "/combos"];

// Staff see the everyday screens; Settings (rate, business, staff) is for managers and the owner.
const LINKS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/inventory", label: "Stock", icon: Package },
  { href: "/combos", label: "Combos", icon: Link2 },
  { href: "/billing", label: "Billing", icon: Receipt },
  { href: "/calculator", label: "Calculator", icon: CalcIcon },
  { href: "/tags", label: "Tags", icon: Tag },
  FEATURES.stockCount && { href: "/audit", label: "Stock count", icon: ScanLine },
  { href: "/catalogue", label: "Catalogue", icon: Images },
  { href: "/settings", label: "Settings", icon: Settings, managers: true },
].filter(Boolean);

export default function AppHeader() {
  const path = usePathname();
  const { user, signOut } = useAuth();
  const { t } = useT();
  const links = LINKS.filter((l) => !l.managers || isManager(user));
  const [calc, setCalc] = useState(false);
  // F2 opens the calculator from any screen.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "F2") {
        e.preventDefault();
        if (!window.location.pathname.startsWith("/calculator")) setCalc(true); // the page is already the calculator
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <header className="no-print border-b border-line bg-surface">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Link href="/" className="font-bold">DFX Wholesale</Link>
          <nav className="hidden flex-wrap gap-1 text-sm sm:flex">
            {links.map(({ href, label, icon: Icon }) => {
              const active = href === "/" ? path === "/" : path.startsWith(href);
              return (
                <Link key={href} href={href}
                  className={clsx("flex items-center gap-1.5 rounded-lg px-2.5 py-1.5",
                    active ? "bg-accent-soft font-semibold text-accent" : "text-muted hover:bg-canvas hover:text-ink")}>
                  <Icon size={16} aria-hidden />
                  {t(label)}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ScanBox />
          <button onClick={() => setCalc(true)} title={`${t("Calculator")} (F2)`}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-sm hover:bg-canvas">
            <CalcIcon size={16} aria-hidden /> <span className="hidden md:inline">{t("Calculator")}</span>
          </button>
          <GoldRateBadge />
          <LanguageSwitch />
          <span className="hidden sm:inline-flex"><HealthBadge /></span>
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-lg border border-line px-2.5 py-1 text-sm hover:bg-canvas">
              {user.full_name.split(" ")[0]} <span className="hidden text-xs text-muted sm:inline">· {t(ROLE_LABEL[user.role])}</span>
            </summary>
            <div className="absolute right-0 z-30 mt-1 w-48 rounded-lg border border-line bg-surface p-1 text-sm shadow-lg">
              <Link href="/help" className="block rounded px-3 py-2 hover:bg-canvas">{t("Help")}</Link>
              <Link href="/settings?tab=password" className="block rounded px-3 py-2 hover:bg-canvas">{t("Change password")}</Link>
              <button onClick={signOut} className="block w-full rounded px-3 py-2 text-left text-red-700 hover:bg-canvas">
                {t("Sign out")}
              </button>
            </div>
          </details>
        </div>
      </div>

      <Calculator open={calc} onClose={() => setCalc(false)} />

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] sm:hidden"
        aria-label={t("Main menu")}>
        {links.filter((l) => PHONE_BAR.includes(l.href)).map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <Link key={href} href={href}
              className={clsx("flex flex-col items-center gap-0.5 px-1 py-2 text-[11px] leading-tight",
                active ? "font-semibold text-accent" : "text-muted")}>
              <Icon size={22} aria-hidden />
              <span className="w-full truncate text-center">{t(label)}</span>
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
