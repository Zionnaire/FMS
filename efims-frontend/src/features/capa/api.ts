import "server-only";
import { ApiError, backendFetch } from "@/lib/backend-client";
import type { CapaAction, CapaActionStatus, CapaActionType, CapaValidation, CapaValidationOutcome, RootCauseAnalysis } from "./types";

const base = (caseId: string) => `/cases/${caseId}`;

export async function createRootCause(accessToken: string, caseId: string, input: { summary: string; analysisMethod?: string }): Promise<RootCauseAnalysis> {
  return backendFetch<RootCauseAnalysis>(`${base(caseId)}/root-causes`, { method: "POST", body: input, accessToken });
}

export async function listRootCauses(accessToken: string, caseId: string): Promise<RootCauseAnalysis[]> {
  return backendFetch<RootCauseAnalysis[]>(`${base(caseId)}/root-causes`, { accessToken });
}

export async function getCurrentRootCause(accessToken: string, caseId: string): Promise<RootCauseAnalysis | null> {
  try {
    return await backendFetch<RootCauseAnalysis>(`${base(caseId)}/root-causes/current`, { accessToken });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export interface CreateCapaActionInput {
  rootCauseId?: string;
  type: CapaActionType;
  title: string;
  description: string;
  ownerId: string;
  dueDate: string;
}

export async function createCapaAction(accessToken: string, caseId: string, input: CreateCapaActionInput): Promise<CapaAction> {
  return backendFetch<CapaAction>(`${base(caseId)}/capa-actions`, { method: "POST", body: input, accessToken });
}

export async function listCapaActions(accessToken: string, caseId: string, status?: CapaActionStatus): Promise<CapaAction[]> {
  const query = status ? `?status=${status}` : "";
  return backendFetch<CapaAction[]>(`${base(caseId)}/capa-actions${query}`, { accessToken });
}

export async function startCapaAction(accessToken: string, caseId: string, actionId: string): Promise<CapaAction> {
  return backendFetch<CapaAction>(`${base(caseId)}/capa-actions/${actionId}/start`, { method: "POST", accessToken });
}

export async function completeCapaAction(accessToken: string, caseId: string, actionId: string, completionNotes?: string): Promise<CapaAction> {
  return backendFetch<CapaAction>(`${base(caseId)}/capa-actions/${actionId}/complete`, { method: "POST", body: { completionNotes }, accessToken });
}

export async function cancelCapaAction(accessToken: string, caseId: string, actionId: string, reason: string): Promise<CapaAction> {
  return backendFetch<CapaAction>(`${base(caseId)}/capa-actions/${actionId}/cancel`, { method: "POST", body: { reason }, accessToken });
}

export async function validateCapaAction(
  accessToken: string,
  caseId: string,
  actionId: string,
  input: { outcome: CapaValidationOutcome; notes?: string },
): Promise<CapaValidation> {
  return backendFetch<CapaValidation>(`${base(caseId)}/capa-actions/${actionId}/validate`, { method: "POST", body: input, accessToken });
}

export async function listCapaValidations(accessToken: string, caseId: string, actionId: string): Promise<CapaValidation[]> {
  return backendFetch<CapaValidation[]>(`${base(caseId)}/capa-actions/${actionId}/validations`, { accessToken });
}

/** Cross-case "my corrective actions" queue for the Remediation/Control Owner dashboard — every
 * open/in-progress action this caller personally owns, across every case they can access. */
export async function getOwnedCapaQueue(accessToken: string): Promise<CapaAction[]> {
  return backendFetch<CapaAction[]>("/capa/queue/owned", { accessToken });
}

/** Cross-case "validation inbox" for the Independent Effectiveness Reviewer dashboard — every
 * completed action awaiting validation, excluding ones the caller owns themselves
 * (`CapaService.validate` enforces that independence server-side too, not just by omission here). */
export async function getCapaValidationQueue(accessToken: string): Promise<CapaAction[]> {
  return backendFetch<CapaAction[]>("/capa/queue/validation", { accessToken });
}
