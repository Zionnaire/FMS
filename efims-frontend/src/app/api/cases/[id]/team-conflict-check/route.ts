import { NextResponse } from "next/server";
import { requireSession } from "@/features/auth/session";
import { checkTeamConflicts } from "@/features/cases/api";
import { ApiError } from "@/lib/backend-client";

/** Client-side fetch target for the case overview's team-reassignment form — fires as the
 * analyst picks a candidate team, before they actually submit the assignment. Same reasoning as
 * `/api/incidents/[id]/severity-suggestion`. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { accessToken } = await requireSession();
  const { id } = await params;
  const teamId = new URL(request.url).searchParams.get("teamId");
  if (!teamId) {
    return NextResponse.json({ error: "teamId is required" }, { status: 400 });
  }
  try {
    const result = await checkTeamConflicts(accessToken, id, teamId);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
