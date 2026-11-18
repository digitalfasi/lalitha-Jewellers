import BillView from "@/modules/billing/BillView";

export const metadata = { title: "Bill · DFX Wholesale" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BillView id={id} />;
}
