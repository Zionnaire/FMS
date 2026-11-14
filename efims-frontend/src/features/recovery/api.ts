import "server-only";
import { backendFetch } from "@/lib/backend-client";
import type { LossCategory, LossEntry, RecoveryEntry, RecoveryMethod, RecoveryPredictionInput, RecoveryRegisterRow, RecoverySuggestion, RecoverySummary, WriteOffEntry } from "./types";

const base = (caseId: string) => `/cases/${caseId}/recovery`;

/** The EFIMS AI Service's recovery-probability predictor — advisory only, no Groq equivalent.
 * `gross_actual_loss_ngn`/`containment_confirmed` are derived server-side from real case data;
 * this input is only the 4 fields EFIMS doesn't model (see `PredictRecoveryDto`'s own doc
 * comment on the backend). */
export async function predictRecovery(accessToken: string, caseId: string, input: RecoveryPredictionInput): Promise<RecoverySuggestion> {
  return backendFetch<RecoverySuggestion>(`${base(caseId)}/predict`, { method: "POST", body: input, accessToken });
}

export async function recordLoss(accessToken: string, caseId: string, input: { amount: number; category: LossCategory; description?: string }): Promise<LossEntry> {
  return backendFetch<LossEntry>(`${base(caseId)}/losses`, { method: "POST", body: input, accessToken });
}

export async function listLosses(accessToken: string, caseId: string): Promise<LossEntry[]> {
  return backendFetch<LossEntry[]>(`${base(caseId)}/losses`, { accessToken });
}

export async function recordRecovery(
  accessToken: string,
  caseId: string,
  input: { amount: number; method: RecoveryMethod; description?: string },
): Promise<RecoveryEntry> {
  return backendFetch<RecoveryEntry>(`${base(caseId)}/recoveries`, { method: "POST", body: input, accessToken });
}

export async function listRecoveries(accessToken: string, caseId: string): Promise<RecoveryEntry[]> {
  return backendFetch<RecoveryEntry[]>(`${base(caseId)}/recoveries`, { accessToken });
}

export async function recordWriteOff(
  accessToken: string,
  caseId: string,
  input: { approvalId: string; amount: number; justification: string },
): Promise<WriteOffEntry> {
  return backendFetch<WriteOffEntry>(`${base(caseId)}/write-offs`, { method: "POST", body: input, accessToken });
}

export async function listWriteOffs(accessToken: string, caseId: string): Promise<WriteOffEntry[]> {
  return backendFetch<WriteOffEntry[]>(`${base(caseId)}/write-offs`, { accessToken });
}

export async function getRecoverySummary(accessToken: string, caseId: string): Promise<RecoverySummary> {
  return backendFetch<RecoverySummary>(`${base(caseId)}/summary`, { accessToken });
}

export interface RecoveryQueueRow {
  caseId: string;
  outstanding: string;
}

/** Cross-case "needs attention" queue for the Recovery/Finance Officer dashboard — every case
 * with loss recorded and still-outstanding exposure, across every case the caller can access. */
export async function getRecoveryQueue(accessToken: string): Promise<RecoveryQueueRow[]> {
  return backendFetch<RecoveryQueueRow[]>("/recovery/queue", { accessToken });
}

/** General cross-case register for the top-level "Recoveries" nav page — every case with any
 * financial activity, not the queue's "still outstanding" subset. */
export async function getRecoveryRegister(accessToken: string): Promise<RecoveryRegisterRow[]> {
  return backendFetch<RecoveryRegisterRow[]>("/recovery", { accessToken });
}
