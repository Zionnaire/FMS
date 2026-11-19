import "server-only";
import { backendFetch } from "@/lib/backend-client";
import type { AccountRiskRating, AnomalySuggestion, VelocityIndicator } from "./types";

export interface ScoreAnomalyInput {
  transactionId: string;
  amountNgn: number;
  channel: string;
  transactionType: string;
  velocityIndicator: VelocityIndicator;
  ipRiskScore: number;
  deviceRiskScore: number;
  isReversal: boolean;
  isChargeback: boolean;
  accountRiskRating: AccountRiskRating;
}

/** Standalone investigative tool — not case-scoped (nothing in EFIMS models a `Transaction`).
 * The EFIMS AI Service's anomaly scorer, no Groq equivalent exists. */
export async function scoreAnomaly(accessToken: string, input: ScoreAnomalyInput): Promise<AnomalySuggestion> {
  return backendFetch<AnomalySuggestion>("/ml-gateway/anomaly/score", { method: "POST", body: input, accessToken });
}

/** The EFIMS AI Service's own v1.0 integration spec, rule #3: "record whether the analyst
 * accepted or overrode it." Only ever called for a structured-model suggestion (one with a real
 * `predictionId` — a Groq fallback's `predictionId` is `null` and was never logged backend-side,
 * so there's nothing to decide). One-way: the backend rejects a second call for the same
 * `predictionId`. */
export async function decidePrediction(accessToken: string, predictionId: string, decision: "ACCEPTED" | "OVERRIDDEN"): Promise<void> {
  await backendFetch<{ predictionId: string; decision: string }>(`/ml-gateway/predictions/${predictionId}/decision`, {
    method: "PATCH",
    body: { decision },
    accessToken,
  });
}
