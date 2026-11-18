import { Suspense } from "react";
import BulkEntry from "@/modules/inventory/BulkEntry";

export const metadata = { title: "Bulk entry · DFX Wholesale" };

export default function Page() {
  // Suspense: BulkEntry reads ?lot= from the URL.
  return (
    <Suspense>
      <BulkEntry />
    </Suspense>
  );
}
