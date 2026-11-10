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

export interface SeverityTrendPoint {
  date: string;
  S1: number;
  S2: number;
  S3: number;
  S4: number;
}

export async function getSeverityTrend(accessToken: string, days = 30): Promise<SeverityTrendPoint[]> {
  return backendFetch<SeverityTrendPoint[]>(`/triage/severity-trend?days=${days}`, { accessToken });
}

export interface SeveritySuggestion {
  suggestedSeverity: SeverityTier;
  confidence: number;
  citedFactors: string[];
  rationale: string;
}

/** CD-08 Phase 2 advisory suggestion — fetched on demand (a button, not an automatic page-load
 * call), since every call is a real Groq request with real latency/cost; the human triaging the
 * incident opts into seeing it rather than it firing silently on every page view. */
export async function getSeveritySuggestion(accessToken: string, incidentId: string): Promise<SeveritySuggestion> {
  return backendFetch<SeveritySuggestion>(`/incidents/${incidentId}/triage/suggestion`, { accessToken });
}
