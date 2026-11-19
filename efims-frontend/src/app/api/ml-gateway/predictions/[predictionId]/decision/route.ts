import { NextResponse } from "next/server";
import { requireSession } from "@/features/auth/session";
import { decidePrediction } from "@/features/ml-gateway/api";
import { ApiError } from "@/lib/backend-client";

/** Client-side fetch target for recording whether an analyst accepted or overrode a logged
 * structured-model prediction (the EFIMS AI Service's v1.0 integration spec, rule #3) — same
 * "a Client Component can't call server-only code directly" reasoning as
 * `/api/incidents/[id]/severity-suggestion`. */
export async function PATCH(request: Request, { params }: { params: Promise<{ predictionId: string }> }) {
  const { accessToken } = await requireSession();
  const { predictionId } = await params;
  const { decision } = (await request.json()) as { decision: "ACCEPTED" | "OVERRIDDEN" };
  try {
    await decidePrediction(accessToken, predictionId, decision);
    return NextResponse.json({ predictionId, decision });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
