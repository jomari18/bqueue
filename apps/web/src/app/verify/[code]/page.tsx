import { VerifyForm } from "@/features/verify/VerifyForm";
import { VerifyLayout } from "@/features/verify/VerifyLayout";
import { VerifyResult } from "@/features/verify/VerifyResult";

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return (
    <VerifyLayout>
      <VerifyResult code={decodeURIComponent(code)} />
      <VerifyForm />
    </VerifyLayout>
  );
}
