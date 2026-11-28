/**
 * The one HTTP helper. The browser talks to the demo server; no credentials are
 * stored here and no authoritative amount is ever taken from the client.
 */

// Same-origin: Vite proxies /api to the local backend, so the session cookie
// is first-party and no credentialed CORS is needed.
export const BASE = "/api";

/** Server error with its machine-readable code (e.g. cross_owner). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export type Method = "PATCH" | "PUT";

export type Call = <T>(path: string, body?: unknown, method?: Method) => Promise<T>;

export function createCall(fetchImpl: typeof fetch): Call {
  return async function call<T>(path: string, body?: unknown, method?: Method): Promise<T> {
    const res = await fetchImpl(`${BASE}${path}`, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      throw new ApiError(res.status, detail.error ?? "error", detail.message ?? `${res.status} ${path}`);
    }
    return (await res.json()) as T;
  };
}

/** Resolves the global fetch at call time, as the original client did. */
export const call: Call = createCall(((...args: Parameters<typeof fetch>) => fetch(...args)) as typeof fetch);
