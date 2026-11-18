import { Suspense } from "react";
import SettingsPage from "@/modules/settings/SettingsPage";

export const metadata = { title: "Settings · DFX Wholesale" };

export default function Page() {
  return (
    <Suspense>
      <SettingsPage />
    </Suspense>
  );
}
