import { NextResponse } from "next/server";
import { requireSession } from "@/features/auth/session";
import { predictRecovery } from "@/features/recovery/api";
import type { RecoveryPredictionInput } from "@/features/recovery/types";
import { ApiError } from "@/lib/backend-client";

/** Client-side fetch target for the case Recovery tab's AI prediction panel — same reasoning as
 * `/api/incidents/[id]/severity-suggestion`. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { accessToken } = await requireSession();
  const { id } = await params;
  const body = (await request.json()) as RecoveryPredictionInput;
  try {
    const result = await predictRecovery(accessToken, id, body);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
