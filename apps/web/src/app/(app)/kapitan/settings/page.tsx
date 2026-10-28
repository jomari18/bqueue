import { getTranslations } from "next-intl/server";
import { Counters } from "@/features/kapitan/settings/Counters";
import { DocumentTypes } from "@/features/kapitan/settings/DocumentTypes";
import { Keys } from "@/features/kapitan/settings/Keys";
import { Simulator } from "@/features/kapitan/settings/Simulator";
import { Staff } from "@/features/kapitan/settings/Staff";

export default async function Page() {
  const t = await getTranslations("settings");
  return (
    <div className="flex flex-col gap-4 pt-4">
      <h1 className="font-heading text-2xl font-bold">{t("title")}</h1>
      <DocumentTypes />
      <Counters />
      <Staff />
      <Keys />
      <Simulator />
    </div>
  );
}
