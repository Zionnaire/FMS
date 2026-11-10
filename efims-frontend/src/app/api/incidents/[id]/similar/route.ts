import { NextResponse } from "next/server";
import { requireSession } from "@/features/auth/session";
import { getSimilarIncidents } from "@/features/incidents/api";
import { ApiError } from "@/lib/backend-client";

/** Client-side fetch target for the CD-08 advisory duplicate/correlation detection — same
 * reasoning as the severity-suggestion route handler next to it. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { accessToken } = await requireSession();
  const { id } = await params;
  try {
    const results = await getSimilarIncidents(accessToken, id);
    return NextResponse.json({ results });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
