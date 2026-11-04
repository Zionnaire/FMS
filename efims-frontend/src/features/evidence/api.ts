import "server-only";
import { backendFetch } from "@/lib/backend-client";
import type { EvidenceCategory, EvidenceItem, VerifyEvidenceResult } from "./types";

const base = (caseId: string) => `/cases/${caseId}/evidence`;

export interface IngestEvidenceInput {
  category: EvidenceCategory;
  title: string;
  description?: string;
  externalRef?: string;
  sourceSystem?: string;
  content: string;
}

export async function ingestEvidence(accessToken: string, caseId: string, input: IngestEvidenceInput): Promise<EvidenceItem> {
  return backendFetch<EvidenceItem>(base(caseId), { method: "POST", body: input, accessToken });
}

export async function listEvidence(accessToken: string, caseId: string): Promise<EvidenceItem[]> {
  return backendFetch<EvidenceItem[]>(base(caseId), { accessToken });
}

export async function getEvidenceItem(accessToken: string, caseId: string, evidenceId: string): Promise<EvidenceItem> {
  return backendFetch<EvidenceItem>(`${base(caseId)}/${evidenceId}`, { accessToken });
}

export async function recordCustodyEvent(
  accessToken: string,
  caseId: string,
  evidenceId: string,
  input: { action: string; relatedUserId?: string; notes?: string },
): Promise<void> {
  return backendFetch<void>(`${base(caseId)}/${evidenceId}/custody`, { method: "POST", body: input, accessToken });
}

export async function verifyEvidence(accessToken: string, caseId: string, evidenceId: string, content: string): Promise<VerifyEvidenceResult> {
  return backendFetch<VerifyEvidenceResult>(`${base(caseId)}/${evidenceId}/verify`, { method: "POST", body: { content }, accessToken });
}

export async function setLegalHold(
  accessToken: string,
  caseId: string,
  evidenceId: string,
  input: { hold: boolean; reason?: string },
): Promise<EvidenceItem> {
  return backendFetch<EvidenceItem>(`${base(caseId)}/${evidenceId}/legal-hold`, { method: "POST", body: input, accessToken });
}

/** Cross-case "needs attention" queue for the Evidence Custodian dashboard — never
 * hash-verified since ingest, or currently under legal hold, across every case the caller can
 * access. */
export async function getEvidenceQueue(accessToken: string): Promise<EvidenceItem[]> {
  return backendFetch<EvidenceItem[]>("/evidence/queue", { accessToken });
}
