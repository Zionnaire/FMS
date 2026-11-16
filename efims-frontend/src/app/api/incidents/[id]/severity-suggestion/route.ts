import { NextResponse } from "next/server";
import { requireSession } from "@/features/auth/session";
import { getSeveritySuggestion } from "@/features/triage/api";
import { ApiError } from "@/lib/backend-client";

/** Client-side fetch target for the CD-08 advisory severity suggestion — a Client Component
 * can't call the `server-only` `features/triage/api.ts` directly, same reasoning as
 * `/api/search` and `/api/realtime-token`. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { accessToken } = await requireSession();
  const { id } = await params;
  const allowLlmFallback = new URL(request.url).searchParams.get("allowLlmFallback") === "true";
  try {
    const suggestion = await getSeveritySuggestion(accessToken, id, allowLlmFallback);
    return NextResponse.json(suggestion);
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
