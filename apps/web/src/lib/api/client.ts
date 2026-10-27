import type { ErrorCode } from "@bq/shared";
import { currentLocale } from "@/i18n/locale";
import { getSession, refreshSession } from "@/lib/auth/session";

/** An API error in the spec 9.9 format; status 0 means the request never reached the server. */
export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: number,
    message: string,
    readonly field?: string,
    readonly retryAfter?: string,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type Init = { method?: string; json?: unknown; headers?: Record<string, string>; auth?: boolean; signal?: AbortSignal };

// Wrong logins and demo calls answer 401 on purpose; refreshing would not help them.
const NO_REFRESH = /^\/api\/(auth\/|demo)/;

async function send(path: string, init: Init): Promise<Response> {
  const headers: Record<string, string> = { "accept-language": currentLocale(), ...init.headers };
  if (init.json !== undefined) headers["content-type"] = "application/json";
  const token = init.auth === false ? null : getSession()?.accessToken;
  if (token) headers.authorization = `Bearer ${token}`;
  try {
    return await fetch(path, {
      method: init.method ?? "GET",
      headers,
      body: init.json === undefined ? undefined : JSON.stringify(init.json),
      credentials: "same-origin",
      signal: init.signal,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new ApiError("service_unavailable", 0, "Can't reach the server.");
  }
}

export async function toApiError(res: Response): Promise<ApiError> {
  const body = (await res.json().catch(() => null)) as { error?: { code?: ErrorCode; message?: string; field?: string; retryAfter?: string } } | null;
  const e = body?.error;
  return new ApiError(e?.code ?? "service_unavailable", res.status, e?.message ?? res.statusText, e?.field, e?.retryAfter, body);
}

/**
 * Calls the API through the same-origin /api proxy. A 401 on a signed-in call refreshes the session once and
 * retries; an ended demo barangay answers `session_expired`.
 */
export async function api<T>(path: string, init: Init = {}): Promise<T> {
  let res = await send(path, init);
  if (res.status === 401 && init.auth !== false && !NO_REFRESH.test(path)) {
    const refreshed = await refreshSession();
    if (refreshed === "ok") res = await send(path, init);
    else if (refreshed === "ended") throw new ApiError("session_expired", 401, "This demo barangay has ended.");
  }
  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
