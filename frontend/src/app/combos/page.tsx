import { Suspense } from "react";
import CombosPage from "@/modules/combos/CombosPage";

export const metadata = { title: "Combos · DFX Wholesale" };

export default function Page() {
  // Suspense: CombosPage reads ?code= from the URL.
  return (
    <Suspense>
      <CombosPage />
    </Suspense>
  );
}
