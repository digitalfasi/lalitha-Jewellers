import { Suspense } from "react";
import TagsPage from "@/modules/tags/TagsPage";

export const metadata = { title: "Tags · DFX Wholesale" };

export default function Page() {
  // Suspense: TagsPage reads ?codes= from the URL.
  return (
    <Suspense>
      <TagsPage />
    </Suspense>
  );
}
