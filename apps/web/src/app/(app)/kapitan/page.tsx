import { Approvals } from "@/features/kapitan/Approvals";
import { ReleasedList } from "@/features/kapitan/ReleasedList";

export default function Page() {
  return (
    <div className="flex flex-col gap-8 pt-4">
      <Approvals />
      <ReleasedList />
    </div>
  );
}
