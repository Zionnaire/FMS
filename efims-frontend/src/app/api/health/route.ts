import { NextResponse } from "next/server";

/**
 * Deliberately unauthenticated and backend-independent — a deploy platform's health check (see
 * `render.yaml`'s `healthCheckPath` for this service) needs to know "is this Next.js server up
 * and serving requests," not "is the EFIMS backend also reachable right now." Every other route
 * either requires a session (`requireSession()` redirects to `/login`, not a 200) or calls the
 * backend, either of which would make this check fail for reasons unrelated to whether this
 * server itself is healthy.
 */
export async function GET() {
  return NextResponse.json({ status: "ok" });
}
