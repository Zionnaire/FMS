import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cookiesSecure } from "@/lib/env";
import type { SessionUser } from "./types";

/**
 * Cookie-based session, holding the EFIMS backend's own signed JWTs verbatim — not re-wrapped in
 * a second app-level session token. The backend already issues short-lived (15m), signed access
 * tokens and rotating refresh tokens with reuse detection (see `efims-backend`'s `AuthService`);
 * adding another encryption layer on top would add complexity without adding security, since
 * these cookies are already `HttpOnly` (unreachable from client JS, the actual XSS-theft
 * mitigation) and the JWTs are already tamper-evident by their own signature. `decodeJwtPayload`
 * below reads claims for optimistic UI only — it never re-verifies the signature; the backend is
 * the sole authority on whether a token is actually valid, on every real request.
 */
const ACCESS_TOKEN_COOKIE = "efims_at";
const REFRESH_TOKEN_COOKIE = "efims_rt";

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: cookiesSecure(),
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

/** Decodes (does NOT verify) a JWT's payload — safe only for reading non-sensitive claims for
 * optimistic UI/redirect decisions. Never trust this for an authorization decision; every
 * backend call re-verifies the token's signature and expiry server-side regardless. */
export function decodeJwtPayload(token: string): SessionUser | null {
  try {
    const [, payloadSegment] = token.split(".");
    if (!payloadSegment) return null;
    const json = Buffer.from(payloadSegment, "base64url").toString("utf8");
    return JSON.parse(json) as SessionUser;
  } catch {
    return null;
  }
}

/** Callable only from a Server Action, Route Handler, or `proxy.ts` — Next.js throws if
 * `cookies().set` is called during a Server Component render. Sets both tokens with the
 * `maxAge` matching each token's own real expiry (read from the token itself, so this file
 * never hardcodes a duration that could drift from what the backend actually issues). */
export async function setSessionCookies(accessToken: string, refreshToken: string): Promise<void> {
  const store = await cookies();
  const accessPayload = decodeJwtPayload(accessToken);
  const refreshPayload = decodeJwtPayload(refreshToken);
  const now = Math.floor(Date.now() / 1000);

  store.set(ACCESS_TOKEN_COOKIE, accessToken, cookieOptions(Math.max((accessPayload?.exp ?? now + 900) - now, 0)));
  store.set(REFRESH_TOKEN_COOKIE, refreshToken, cookieOptions(Math.max((refreshPayload?.exp ?? now + 7 * 86400) - now, 0)));
}

export async function clearSessionCookies(): Promise<void> {
  const store = await cookies();
  store.delete(ACCESS_TOKEN_COOKIE);
  store.delete(REFRESH_TOKEN_COOKIE);
}

export async function getRefreshToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(REFRESH_TOKEN_COOKIE)?.value;
}

/** The read-only half of the session — safe to call from a Server Component (only reads
 * cookies, never writes). Returns `null` if there's no access-token cookie or it's expired;
 * callers that need a guaranteed session should use `requireSession()` instead. */
export async function getSession(): Promise<{ accessToken: string; user: SessionUser } | null> {
  const store = await cookies();
  const accessToken = store.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!accessToken) return null;

  const user = decodeJwtPayload(accessToken);
  if (!user) return null;

  const now = Math.floor(Date.now() / 1000);
  if (user.exp <= now) return null;

  return { accessToken, user };
}

/** The DAL entry point every protected Server Component/Server Action should call first — see
 * the Next.js authentication guide's "Creating a Data Access Layer" pattern. `proxy.ts` already
 * redirects unauthenticated requests away from protected routes as an optimistic, UX-level
 * check; this is the real check, since a Proxy matcher change or a Server Action reached from an
 * unmatched route would otherwise silently skip that redirect. */
export async function requireSession(): Promise<{ accessToken: string; user: SessionUser }> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}
