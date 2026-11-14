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
