import "server-only";
import { backendUrl } from "./env";

/**
 * The **only** place in this codebase allowed to know the EFIMS backend's origin. Every backend
 * call in this app happens here, from server-side code (Server Components, Server Actions,
 * `proxy.ts`) — never from a Client Component. `BACKEND_URL` is a server-only env var (no
 * `NEXT_PUBLIC_` prefix), so it's structurally impossible for it to leak into a client bundle;
 * this file additionally imports `server-only` so importing it from a Client Component is a
 * build error, not just a convention.
 *
 * This mirrors the project's own confirmed toolset rule (CLAUDE.md: "Talks to backend only via
 * REST. No direct DB or AI access") one level further: the *browser* never talks to the backend
 * at all, only this Next.js server does, on the browser's behalf, per request. See
 * `features/auth/session.ts` for how the access token this function attaches gets there.
 *
 * Every request is `cache: 'no-store'` — this is an access-control-sensitive system (case
 * compartments, clearance, RLS); a stale cached response could show data a caller's current
 * session no longer has access to. Speed comes from Server Components' own request-level
 * dedup and streaming, not from caching authorization-sensitive reads.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface BackendFetchOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  accessToken?: string;
  /** Only for the login/refresh calls that happen before a session exists — never used for
   * anything reachable by an authenticated user's own action. */
  skipAuth?: boolean;
}

export async function backendFetch<T>(path: string, options: BackendFetchOptions = {}): Promise<T> {
  const { method = "GET", body, accessToken, skipAuth = false } = options;

  if (!accessToken && !skipAuth) {
    // Fails loudly rather than silently sending an unauthenticated request — every real call
    // site should have a token by construction (see session.ts's requireSession()).
    throw new ApiError(401, "No access token available for this request");
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const res = await fetch(`${backendUrl()}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;

  if (!res.ok) {
    const message = (data && typeof data === "object" && "message" in data ? String(data.message) : undefined) ?? res.statusText;
    throw new ApiError(res.status, message, data);
  }

  return data as T;
}
