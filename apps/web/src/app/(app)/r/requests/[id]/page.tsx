import { RequestDetail } from "@/features/resident/RequestDetail";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <RequestDetail id={(await params).id} />;
}
