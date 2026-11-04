import "server-only";
import { ApiError, backendFetch } from "@/lib/backend-client";
import type { SeverityTier, TriageAssessment } from "./types";

export interface AssessInput {
  severity: SeverityTier;
  slaCalendarName: string;
  assignedTeamId?: string;
  rationale: string;
}

export async function assessIncident(accessToken: string, incidentId: string, input: AssessInput): Promise<TriageAssessment> {
  return backendFetch<TriageAssessment>(`/incidents/${incidentId}/triage`, { method: "POST", body: input, accessToken });
}

export async function escalateIncident(accessToken: string, incidentId: string, input: AssessInput): Promise<TriageAssessment> {
  return backendFetch<TriageAssessment>(`/incidents/${incidentId}/triage/escalate`, { method: "POST", body: input, accessToken });
}

export async function getCurrentTriage(accessToken: string, incidentId: string): Promise<TriageAssessment | null> {
  try {
    return await backendFetch<TriageAssessment>(`/incidents/${incidentId}/triage`, { accessToken });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function getTriageHistory(accessToken: string, incidentId: string): Promise<TriageAssessment[]> {
  return backendFetch<TriageAssessment[]>(`/incidents/${incidentId}/triage/history`, { accessToken });
}
