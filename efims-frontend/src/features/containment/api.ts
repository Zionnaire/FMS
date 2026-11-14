import "server-only";
import { backendFetch } from "@/lib/backend-client";
import type { ContainmentActionType, ContainmentRegisterRow, ContainmentRequest } from "./types";

const base = (caseId: string) => `/cases/${caseId}/containment-requests`;

export async function createContainmentRequest(
  accessToken: string,
  caseId: string,
  input: { approvalId: string; actionType: ContainmentActionType; targetDescription: string; rationale: string },
): Promise<ContainmentRequest> {
  return backendFetch<ContainmentRequest>(base(caseId), { method: "POST", body: input, accessToken });
}

export async function listContainmentRequests(accessToken: string, caseId: string): Promise<ContainmentRequest[]> {
  return backendFetch<ContainmentRequest[]>(base(caseId), { accessToken });
}

export async function confirmContainmentRequest(
  accessToken: string,
  caseId: string,
  requestId: string,
  confirmationRef?: string,
): Promise<ContainmentRequest> {
  return backendFetch<ContainmentRequest>(`${base(caseId)}/${requestId}/confirm`, { method: "POST", body: { confirmationRef }, accessToken });
}

export async function rejectContainmentRequest(accessToken: string, caseId: string, requestId: string, reason: string): Promise<ContainmentRequest> {
  return backendFetch<ContainmentRequest>(`${base(caseId)}/${requestId}/reject`, { method: "POST", body: { reason }, accessToken });
}

export async function cancelContainmentRequest(accessToken: string, caseId: string, requestId: string, reason: string): Promise<ContainmentRequest> {
  return backendFetch<ContainmentRequest>(`${base(caseId)}/${requestId}/cancel`, { method: "POST", body: { reason }, accessToken });
}

/** General cross-case register for the top-level "Containment" nav page — every request across
 * every accessible case. */
export async function getContainmentRegister(accessToken: string): Promise<ContainmentRegisterRow[]> {
  return backendFetch<ContainmentRegisterRow[]>("/containment-requests", { accessToken });
}
