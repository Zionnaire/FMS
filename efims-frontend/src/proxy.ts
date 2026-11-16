import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Optimistic, cookie-only route gate — Next.js 16 renamed `middleware.ts` to `proxy.ts` (see
 * `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`). This is deliberately
 * NOT the real authorization boundary: it only decides whether to redirect toward `/login` or
 * away from it, based on decoding (not verifying) the access-token cookie. The actual
 * authorization — the full 7-condition case-access rule, RLS, role/compartment checks — is
 * enforced by the EFIMS backend on every real request regardless of what happens here, exactly
 * as the Next.js authentication guide recommends ("Proxy should not be your only line of
 * defense... perform security checks as close as possible to your data source"). A bug in this
 * file's matcher can only ever produce a wrong redirect, never a wrong authorization decision.
 *
 * Also does silent access-token refresh: since Server Components can only read cookies (writing
 * one during render throws), and Proxy is the one place that runs before every navigation *and*
 * can set cookies on the response, refreshing here is what keeps a Server Component from ever
 * having to handle a live-expired access token mid-render.
 *
 * Deliberately self-contained — no imports from `src/features/` or `src/lib/`. Per Next.js's own
 * Proxy docs: "Proxy is meant to be invoked separately of your render code... you should not
 * attempt relying on shared modules or globals." `decodeJwtPayload` below is a duplicate of
 * `features/auth/session.ts`'s function of the same name, not a shared import, for exactly that
 * reason — keep them in sync if the JWT payload shape ever changes.
 */
const PUBLIC_ROUTES = new Set(["/login"]);
const REFRESH_THRESHOLD_SECONDS = 120;

const ACCESS_TOKEN_COOKIE = "efims_at";
const REFRESH_TOKEN_COOKIE = "efims_rt";

/** Platform/super-admin layer (added 2026-10-14) — a completely separate cookie, checked by a
 * separate branch below, never touching `ACCESS_TOKEN_COOKIE`/`REFRESH_TOKEN_COOKIE`. No silent
 * refresh here (the platform layer has no refresh token at all — see `PlatformAuthService`'s own
 * doc comment on why): an expired platform session just redirects to `/platform/login`, same as
 * any other expired session would without a refresh token to fall back on. */
const PLATFORM_ACCESS_TOKEN_COOKIE = "efims_platform_at";
const PLATFORM_LOGIN_PATH = "/platform/login";

function handlePlatformRoute(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const isLoginRoute = pathname === PLATFORM_LOGIN_PATH;

  const token = request.cookies.get(PLATFORM_ACCESS_TOKEN_COOKIE)?.value;
  const payload = token ? decodeJwtPayload(token) : null;
  const now = Math.floor(Date.now() / 1000);
  const isValid = !!payload && payload.exp > now;

  if (!isLoginRoute && !isValid) {
    return NextResponse.redirect(new URL(PLATFORM_LOGIN_PATH, request.url));
  }
  if (isLoginRoute && isValid) {
    return NextResponse.redirect(new URL("/platform", request.url));
  }
  return NextResponse.next();
}

interface DecodedJwt {
  exp: number;
}

function decodeJwtPayload(token: string): DecodedJwt | null {
  try {
    const [, payloadSegment] = token.split(".");
    if (!payloadSegment) return null;
    return JSON.parse(Buffer.from(payloadSegment, "base64url").toString("utf8")) as DecodedJwt;
  } catch {
    return null;
  }
}

interface RefreshResult {
  accessToken: string;
  refreshToken: string;
}

async function tryRefresh(refreshToken: string): Promise<RefreshResult | null> {
  const backendUrl = (process.env.BACKEND_URL ?? "").replace(/\/$/, "");
  try {
    const res = await fetch(`${backendUrl}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as RefreshResult;
  } catch {
    return null;
  }
}

function setAuthCookies(response: NextResponse, tokens: RefreshResult) {
  const now = Math.floor(Date.now() / 1000);
  const accessPayload = decodeJwtPayload(tokens.accessToken);
  const refreshPayload = decodeJwtPayload(tokens.refreshToken);
  const secure = process.env.COOKIES_SECURE !== "false";

  response.cookies.set(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: Math.max((accessPayload?.exp ?? now + 900) - now, 0),
  });
  response.cookies.set(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: Math.max((refreshPayload?.exp ?? now + 7 * 86400) - now, 0),
  });
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/platform")) {
    return handlePlatformRoute(request);
  }

  const isPublicRoute = PUBLIC_ROUTES.has(pathname);

  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;
  const payload = accessToken ? decodeJwtPayload(accessToken) : null;
  const now = Math.floor(Date.now() / 1000);
  const isValid = !!payload && payload.exp > now;
  const expiringSoon = isValid && payload.exp - now < REFRESH_THRESHOLD_SECONDS;

  if ((!isValid || expiringSoon) && refreshToken) {
    const refreshed = await tryRefresh(refreshToken);

    if (refreshed) {
      const response = isPublicRoute ? NextResponse.redirect(new URL("/", request.url)) : NextResponse.next();
      setAuthCookies(response, refreshed);
      return response;
    }

    if (!isValid) {
      // No usable access token, and the refresh token that might have replaced it is itself
      // invalid/revoked/reused — this is a fully signed-out state. Clear both cookies so a
      // stale, unusable refresh token doesn't linger in the browser.
      const response = isPublicRoute ? NextResponse.next() : NextResponse.redirect(new URL("/login", request.url));
      response.cookies.delete(ACCESS_TOKEN_COOKIE);
      response.cookies.delete(REFRESH_TOKEN_COOKIE);
      return response;
    }
    // Refresh failed, but the current access token is still valid for now (only expiring soon)
    // — fall through and let this request proceed; the next navigation will try refreshing again.
  }

  if (!isPublicRoute && !isValid) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (isPublicRoute && isValid) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // `api/health` excluded alongside the existing static-asset exemptions — a deploy platform's
  // liveness check (see render.yaml's healthCheckPath for this service) has no session cookie by
  // design and must never be redirected to /login; it only needs to know this server is up.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/health).*)"],
};
