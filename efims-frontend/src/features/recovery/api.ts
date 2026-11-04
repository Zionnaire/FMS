import "server-only";
import { backendFetch } from "@/lib/backend-client";
import type { LossCategory, LossEntry, RecoveryEntry, RecoveryMethod, RecoverySummary, WriteOffEntry } from "./types";

const base = (caseId: string) => `/cases/${caseId}/recovery`;

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
