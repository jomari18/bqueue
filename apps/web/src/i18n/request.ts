import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { asLocale, LOCALE_COOKIE } from "./locale";

export default getRequestConfig(async () => {
  const locale = asLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  return {
    locale,
    timeZone: "Asia/Manila",
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
