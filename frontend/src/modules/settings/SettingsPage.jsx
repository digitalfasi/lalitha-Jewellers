"use client";

import { useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import { isManager, isOwner, useAuth } from "@/_shared/auth/AuthProvider";
import BusinessTab from "./BusinessTab";
import PasswordTab from "./PasswordTab";
import RateTab from "./RateTab";
import StaffTab from "./StaffTab";

const TABS = [
  { id: "rate", label: "Gold rate", show: () => true },
  { id: "business", label: "Business details", show: () => true },
  { id: "staff", label: "Staff", show: isOwner },
  { id: "password", label: "My password", show: () => true },
];

export default function SettingsPage() {
  const { user } = useAuth();
  const params = useSearchParams();
  const router = useRouter();
  const tabs = TABS.filter((t) => t.show(user));
  const tab = tabs.find((t) => t.id === params.get("tab"))?.id || "rate";

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted">
          {isOwner(user)
            ? "You're the owner: you can change everything here."
            : isManager(user)
              ? "Managers can set the gold rate. Business details and staff are for the owner."
              : "Only the owner or a manager can change these; you can see them."}
        </p>
      </div>
      <div className="flex w-fit flex-wrap gap-1 rounded-xl border border-line bg-surface p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => router.replace(`/settings?tab=${t.id}`)}
            className={clsx("rounded-lg px-3 py-1.5 text-sm", tab === t.id ? "bg-accent text-white" : "text-muted hover:text-ink")}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "rate" && <RateTab canEdit={isManager(user)} />}
      {tab === "business" && <BusinessTab canEdit={isOwner(user)} />}
      {tab === "staff" && <StaffTab me={user} />}
      {tab === "password" && <PasswordTab />}
    </div>
  );
}
