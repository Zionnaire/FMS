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

export async function getIncident(accessToken: string, id: string): Promise<Incident> {
  return backendFetch<Incident>(`/incidents/${id}`, { accessToken });
}

export async function relateIncidents(accessToken: string, id: string, relatedIncidentId: string): Promise<void> {
  return backendFetch<void>(`/incidents/${id}/relate`, { method: "POST", body: { relatedIncidentId }, accessToken });
}

export async function mergeIncident(accessToken: string, id: string, targetIncidentId: string): Promise<Incident> {
  return backendFetch<Incident>(`/incidents/${id}/merge`, { method: "POST", body: { targetIncidentId }, accessToken });
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
