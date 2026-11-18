import AuditScan from "@/modules/audit/AuditScan";

export const metadata = { title: "Stock count · DFX Wholesale" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AuditScan id={id} />;
}
