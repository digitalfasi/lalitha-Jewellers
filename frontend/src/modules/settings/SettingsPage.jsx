"use client";

import { useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import { isManager, isOwner, useAuth } from "@/_shared/auth/AuthProvider";
import { useT } from "@/_shared/i18n/LanguageProvider";
import BusinessTab from "./BusinessTab";
import ChargesTab from "./ChargesTab";
import DeviceTab from "./DeviceTab";
import PasswordTab from "./PasswordTab";
import RateTab from "./RateTab";
import StaffTab from "./StaffTab";

const TABS = [
  { id: "rate", label: "Gold rate", show: () => true },
  { id: "charges", label: "Bill settings", show: () => true },
  { id: "device", label: "This device", show: () => true },
  { id: "business", label: "Business details", show: () => true },
  { id: "staff", label: "Staff", show: isOwner },
  { id: "password", label: "My password", show: () => true },
];

export default function SettingsPage() {
  const { user } = useAuth();
  const { t } = useT();
  const params = useSearchParams();
  const router = useRouter();
  const tabs = TABS.filter((x) => x.show(user));
  const tab = tabs.find((x) => x.id === params.get("tab"))?.id || "rate";

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">{t("Settings")}</h1>
        <p className="text-sm text-muted">
          {isOwner(user)
            ? t("You're the owner: you can change everything here.")
            : isManager(user)
              ? t("Managers can set the gold rate. Business details and staff are for the owner.")
              : t("Only the owner or a manager can change these; you can see them.")}
        </p>
      </div>
      <div className="flex w-fit flex-wrap gap-1 rounded-xl border border-line bg-surface p-1">
        {tabs.map((x) => (
          <button
            key={x.id}
            onClick={() => router.replace(`/settings?tab=${x.id}`)}
            className={clsx("rounded-lg px-3 py-1.5 text-sm", tab === x.id ? "bg-accent text-white" : "text-muted hover:text-ink")}
          >
            {t(x.label)}
          </button>
        ))}
      </div>
      {tab === "rate" && <RateTab canEdit={isManager(user)} />}
      {tab === "charges" && <ChargesTab canEdit={isManager(user)} />}
      {tab === "device" && <DeviceTab />}
      {tab === "business" && <BusinessTab canEdit={isOwner(user)} />}
      {tab === "staff" && <StaffTab me={user} />}
      {tab === "password" && <PasswordTab />}
    </div>
  );
}
