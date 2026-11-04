import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cookiesSecure } from "@/lib/env";
import type { PlatformSessionUser } from "./types";

/**
 * Platform-layer session — a completely separate httpOnly cookie from the tenant session
 * (`features/auth/session.ts`'s `efims_at`/`efims_rt`), holding the backend's platform-scoped
 * JWT verbatim, same "no second encryption wrapper" reasoning as the tenant session. No refresh
 * token (see `PlatformAuthService`'s own doc comment on why) — a platform session simply expires
 * after its TTL and requires a fresh login, no silent refresh in `proxy.ts` for this cookie.
 */
const PLATFORM_ACCESS_TOKEN_COOKIE = "efims_platform_at";

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: cookiesSecure(),
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

function decodeJwtPayload(token: string): PlatformSessionUser | null {
  try {
    const [, payloadSegment] = token.split(".");
    if (!payloadSegment) return null;
    const json = Buffer.from(payloadSegment, "base64url").toString("utf8");
    return JSON.parse(json) as PlatformSessionUser;
  } catch {
    return null;
  }
}

export async function setPlatformSessionCookie(accessToken: string): Promise<void> {
  const store = await cookies();
  const payload = decodeJwtPayload(accessToken);
  const now = Math.floor(Date.now() / 1000);
  store.set(PLATFORM_ACCESS_TOKEN_COOKIE, accessToken, cookieOptions(Math.max((payload?.exp ?? now + 3600) - now, 0)));
}

export async function clearPlatformSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(PLATFORM_ACCESS_TOKEN_COOKIE);
}

export async function getPlatformSession(): Promise<{ accessToken: string; user: PlatformSessionUser } | null> {
  const store = await cookies();
  const accessToken = store.get(PLATFORM_ACCESS_TOKEN_COOKIE)?.value;
  if (!accessToken) return null;

  const user = decodeJwtPayload(accessToken);
  if (!user) return null;

  const now = Math.floor(Date.now() / 1000);
  if (user.exp <= now) return null;

  return { accessToken, user };
}

export async function requirePlatformSession(): Promise<{ accessToken: string; user: PlatformSessionUser }> {
  const session = await getPlatformSession();
  if (!session) {
    redirect("/platform/login");
  }
  return session;
}
