import { Suspense } from "react";
import InventoryPage from "@/modules/inventory/InventoryPage";

export const metadata = { title: "Inventory · DFX Wholesale" };

export default function Page() {
  // Suspense: the pieces list reads ?piece= (opened from the header scan box).
  return (
    <Suspense>
      <InventoryPage />
    </Suspense>
  );
}
