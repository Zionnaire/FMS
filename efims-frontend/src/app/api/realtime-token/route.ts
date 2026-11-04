import { NextResponse } from "next/server";
import { requireSession } from "@/features/auth/session";

/**
 * The one way a Client Component gets at the access token: the session cookie is `httpOnly` by
 * design (see `session.ts`'s own doc comment — the real XSS mitigation), so client JS can't read
 * it directly. The backend's realtime Socket.IO gateway authenticates with this exact same
 * short-lived access token at the handshake (`auth: { token }`), so this route just hands back
 * what's already in the session cookie — no new token-minting logic, same TTL as every other use
 * of this token. `requireSession()` redirects to `/login` if there's no valid session, same as
 * every other protected route; a fetch that follows that redirect simply won't get `{ token }`
 * back, which the caller (`use-realtime-notifications.ts`) treats as "don't connect."
 */
export async function GET() {
  const { accessToken } = await requireSession();
  return NextResponse.json({ token: accessToken });
}
