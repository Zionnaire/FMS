import { NextResponse } from "next/server";
import { requireSession } from "@/features/auth/session";
import { scoreAnomaly, type ScoreAnomalyInput } from "@/features/ml-gateway/api";
import { ApiError } from "@/lib/backend-client";

/** Client-side fetch target for the standalone transaction-risk-scoring tool — a Client
 * Component can't call the `server-only` `features/ml-gateway/api.ts` directly, same reasoning
 * as `/api/incidents/[id]/severity-suggestion`. */
export async function POST(request: Request) {
  const { accessToken } = await requireSession();
  const body = (await request.json()) as ScoreAnomalyInput;
  try {
    const result = await scoreAnomaly(accessToken, body);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
