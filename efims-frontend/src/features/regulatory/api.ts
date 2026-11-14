import "server-only";
import { backendFetch } from "@/lib/backend-client";
import type { ObligationStatus, ObligationType, RegulatoryObligation, RegulatoryRegisterRow } from "./types";

const base = (caseId: string) => `/cases/${caseId}/regulatory-obligations`;

export async function createObligation(
  accessToken: string,
  caseId: string,
  input: { obligationType: ObligationType; description: string; regulatorName?: string; deadline: string },
): Promise<RegulatoryObligation> {
  return backendFetch<RegulatoryObligation>(base(caseId), { method: "POST", body: input, accessToken });
}

export async function listObligations(accessToken: string, caseId: string, status?: ObligationStatus): Promise<RegulatoryObligation[]> {
  const query = status ? `?status=${status}` : "";
  return backendFetch<RegulatoryObligation[]>(`${base(caseId)}${query}`, { accessToken });
}

export async function getObligation(accessToken: string, caseId: string, obligationId: string): Promise<RegulatoryObligation> {
  return backendFetch<RegulatoryObligation>(`${base(caseId)}/${obligationId}`, { accessToken });
}

export async function submitObligation(
  accessToken: string,
  caseId: string,
  obligationId: string,
  input: { approvalId: string; referenceNumber?: string; notes?: string },
): Promise<RegulatoryObligation> {
  return backendFetch<RegulatoryObligation>(`${base(caseId)}/${obligationId}/submit`, { method: "POST", body: input, accessToken });
}

export async function acknowledgeObligation(accessToken: string, caseId: string, obligationId: string, acknowledgedRef?: string): Promise<RegulatoryObligation> {
  return backendFetch<RegulatoryObligation>(`${base(caseId)}/${obligationId}/acknowledge`, { method: "POST", body: { acknowledgedRef }, accessToken });
}

export async function waiveObligation(accessToken: string, caseId: string, obligationId: string, reason: string): Promise<RegulatoryObligation> {
  return backendFetch<RegulatoryObligation>(`${base(caseId)}/${obligationId}/waive`, { method: "POST", body: { reason }, accessToken });
}

/** General cross-case register for the top-level "Regulatory reports" nav page — every
 * obligation across every accessible case. */
export async function getRegulatoryRegister(accessToken: string): Promise<RegulatoryRegisterRow[]> {
  return backendFetch<RegulatoryRegisterRow[]>("/regulatory-obligations", { accessToken });
}
