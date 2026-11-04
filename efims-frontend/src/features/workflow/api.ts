import "server-only";
import { ApiError, backendFetch } from "@/lib/backend-client";
import type { ApprovalAction, ApprovalRequest, SeverityBand, SlaClock } from "./types";

// --- SLA clocks (nested under incidents) ---

export async function startSlaClock(accessToken: string, incidentId: string, targetDeadline: string): Promise<SlaClock> {
  return backendFetch<SlaClock>(`/incidents/${incidentId}/sla-clock`, { method: "POST", body: { targetDeadline }, accessToken });
}

export async function getCurrentSlaClock(accessToken: string, incidentId: string): Promise<SlaClock | null> {
  try {
    return await backendFetch<SlaClock>(`/incidents/${incidentId}/sla-clock`, { accessToken });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

// `incidentId` is required in these paths even though the backend's own pause/resume/stop
// handlers only use `clockId` — the route is nested under `/incidents/:incidentId/sla-clock/...`
// at the controller level (see `SlaClockController`), so the full path must still be supplied.
export async function pauseSlaClock(accessToken: string, incidentId: string, clockId: string, reason: string): Promise<SlaClock> {
  return backendFetch<SlaClock>(`/incidents/${incidentId}/sla-clock/${clockId}/pause`, {
    method: "POST",
    body: { reason },
    accessToken,
  });
}

export async function resumeSlaClock(accessToken: string, incidentId: string, clockId: string): Promise<SlaClock> {
  return backendFetch<SlaClock>(`/incidents/${incidentId}/sla-clock/${clockId}/resume`, { method: "POST", accessToken });
}

export async function stopSlaClock(accessToken: string, incidentId: string, clockId: string): Promise<SlaClock> {
  return backendFetch<SlaClock>(`/incidents/${incidentId}/sla-clock/${clockId}/stop`, { method: "POST", accessToken });
}

// --- Approvals (nested under cases) ---

export interface RequestApprovalInput {
  action: ApprovalAction;
  severityBand: SeverityBand;
  requestNotes: string;
}

export async function requestApproval(accessToken: string, caseId: string, input: RequestApprovalInput): Promise<ApprovalRequest> {
  return backendFetch<ApprovalRequest>(`/cases/${caseId}/approvals`, { method: "POST", body: input, accessToken });
}

export async function listApprovals(accessToken: string, caseId: string): Promise<ApprovalRequest[]> {
  return backendFetch<ApprovalRequest[]>(`/cases/${caseId}/approvals`, { accessToken });
}

export async function decideApproval(
  accessToken: string,
  caseId: string,
  approvalId: string,
  input: { approved: boolean; decisionNotes?: string },
): Promise<ApprovalRequest> {
  return backendFetch<ApprovalRequest>(`/cases/${caseId}/approvals/${approvalId}/decide`, { method: "POST", body: input, accessToken });
}
