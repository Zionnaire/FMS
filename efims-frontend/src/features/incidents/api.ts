import "server-only";
import { ApiError, backendFetch } from "@/lib/backend-client";
import type { Compartment } from "@/features/auth/types";
import type { Incident, IncidentStats, IncidentStatus, ListIncidentsResult, WhistleblowerIdentity } from "./types";

export interface ListIncidentsParams {
  accessToken: string;
  status?: IncidentStatus;
  compartment?: Compartment;
  q?: string;
  limit?: number;
  offset?: number;
}

export async function listIncidents({ accessToken, status, compartment, q, limit, offset }: ListIncidentsParams): Promise<ListIncidentsResult> {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (compartment) params.set("compartment", compartment);
  if (q) params.set("q", q);
  if (limit !== undefined) params.set("limit", String(limit));
  if (offset !== undefined) params.set("offset", String(offset));
  const query = params.toString();

  return backendFetch<ListIncidentsResult>(`/incidents${query ? `?${query}` : ""}`, { accessToken });
}

export async function getIncidentStats(accessToken: string): Promise<IncidentStats> {
  return backendFetch<IncidentStats>("/incidents/stats", { accessToken });
}

export interface SimilarIncidentResult {
  incidentId: string;
  score: number;
  citedFactors: string[];
}

/** CD-08 Phase 2 advisory duplicate/correlation detection — fetched on demand, same "real Groq
 * call, human opts in" reasoning as `features/triage/api.ts`'s `getSeveritySuggestion`. The
 * caller wires the result to the already-existing `relateIncidents`/`mergeIncident` actions
 * below — this only ever finds and scores candidates, never merges/links anything itself. */
export async function getSimilarIncidents(accessToken: string, incidentId: string): Promise<SimilarIncidentResult[]> {
  return backendFetch<SimilarIncidentResult[]>(`/incidents/${incidentId}/similar`, { accessToken });
}

export async function getIncident(accessToken: string, id: string): Promise<Incident> {
  return backendFetch<Incident>(`/incidents/${id}`, { accessToken });
}

export async function relateIncidents(accessToken: string, id: string, relatedIncidentId: string): Promise<void> {
  return backendFetch<void>(`/incidents/${id}/relate`, { method: "POST", body: { relatedIncidentId }, accessToken });
}

export async function mergeIncident(accessToken: string, id: string, targetIncidentId: string): Promise<Incident> {
  return backendFetch<Incident>(`/incidents/${id}/merge`, { method: "POST", body: { targetIncidentId }, accessToken });
}

export interface UpdateRiskFactorsInput {
  financialExposureNgn?: number;
  customerImpactCount?: number;
  ongoingThreat?: boolean;
  insiderInvolvement?: boolean;
  dataCompromise?: boolean;
  regulatoryRelevance?: boolean;
  channel?: string;
  reportedByType?: string;
}

/** Structured facts the EFIMS AI Service's severity model needs (`ml-gateway`'s primary severity
 * engine) — a partial update, captured once rather than re-entered on every suggestion request. */
export async function updateRiskFactors(accessToken: string, id: string, input: UpdateRiskFactorsInput): Promise<Incident> {
  return backendFetch<Incident>(`/incidents/${id}/risk-factors`, { method: "PATCH", body: input, accessToken });
}

/** Gated to COMPLIANCE_MLRO/LEGAL_COUNSEL/ADMIN on the backend — a 403 here is expected and
 * normal for most callers, not an error state to alarm over. */
export async function getWhistleblowerIdentity(accessToken: string, signalId: string): Promise<WhistleblowerIdentity | "forbidden"> {
  try {
    return await backendFetch<WhistleblowerIdentity>(`/incidents/${signalId}/whistleblower-identity`, { accessToken });
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      return "forbidden";
    }
    throw error;
  }
}
