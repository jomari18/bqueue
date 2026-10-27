// Every API error has one of these codes (spec 9.9) and a message in English and Filipino.

export const ERROR_STATUS = {
  invalid_input: 400,
  unauthenticated: 401,
  invalid_credentials: 401,
  session_expired: 401,
  forbidden: 403,
  bad_proxy_signature: 403,
  not_found: 404,
  invalid_transition: 409,
  counter_busy: 409,
  call_limit: 409,
  already_in_queue: 409,
  limit_reached: 409,
  account_locked: 423,
  rate_limited: 429,
  demo_limit: 429,
  demo_full: 503,
  service_unavailable: 503,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;
export type Bilingual = { en: string; fil: string };
export type Lang = "en" | "fil";
export type ApiErrorBody = {
  error: { code: ErrorCode; message: string; field?: string; retryAfter?: string };
};

export const ERROR_MESSAGES: Record<ErrorCode, Bilingual> = {
  invalid_input: { en: "Please check what you entered.", fil: "Pakisuri ang inilagay mo." },
  unauthenticated: { en: "Please sign in.", fil: "Mag-sign in muna." },
  invalid_credentials: { en: "Wrong username or password.", fil: "Mali ang username o password." },
  session_expired: { en: "This demo barangay has ended.", fil: "Tapos na ang demo barangay na ito." },
  forbidden: { en: "You can't do that with this account.", fil: "Hindi mo ito magagawa gamit ang account na ito." },
  bad_proxy_signature: {
    en: "This request must come through the B.Queue website.",
    fil: "Dapat dumaan sa B.Queue website ang request na ito.",
  },
  not_found: { en: "We couldn't find that.", fil: "Hindi ito makita." },
  invalid_transition: {
    en: "That can't be done in its current status.",
    fil: "Hindi ito puwede sa kasalukuyang status nito.",
  },
  counter_busy: {
    en: "This counter is still serving a number.",
    fil: "May tinatawag pang numero sa counter na ito.",
  },
  call_limit: { en: "This number was already called 3 times.", fil: "Natawag na nang 3 beses ang numerong ito." },
  already_in_queue: {
    en: "You already have a number in this line.",
    fil: "May numero ka na sa pilang ito.",
  },
  limit_reached: { en: "The limit has been reached.", fil: "Naabot na ang limit." },
  account_locked: {
    en: "Too many wrong tries. Please wait 15 minutes.",
    fil: "Sobra na ang maling subok. Maghintay ng 15 minuto.",
  },
  rate_limited: {
    en: "Too many requests. Please wait a moment and try again.",
    fil: "Sobrang daming request. Maghintay sandali at subukan ulit.",
  },
  demo_limit: {
    en: "You've opened the most demo barangays for today. Please try again tomorrow.",
    fil: "Naabot mo na ang dami ng demo barangay ngayong araw. Subukan ulit bukas.",
  },
  demo_full: {
    en: "The demo is full right now. Please try again later.",
    fil: "Puno ang demo ngayon. Subukan ulit mamaya.",
  },
  service_unavailable: {
    en: "Something went wrong on our side. Please try again.",
    fil: "May nagkaproblema sa amin. Subukan ulit.",
  },
};

/** The first language of the Accept-Language header decides: fil or tl gives Filipino, anything else English. */
export function pickLanguage(acceptLanguage: string | undefined): Lang {
  const first = acceptLanguage?.split(",")[0]?.trim().toLowerCase() ?? "";
  return first.startsWith("fil") || first.startsWith("tl") ? "fil" : "en";
}
