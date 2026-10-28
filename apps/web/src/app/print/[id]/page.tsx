import { PrintDocument } from "@/features/print/PrintDocument";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PrintDocument id={id} />;
}
