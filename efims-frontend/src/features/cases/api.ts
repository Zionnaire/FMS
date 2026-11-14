import "server-only";
import { backendFetch } from "@/lib/backend-client";
import type { Compartment } from "@/features/auth/types";
import type { BulkCaseActionResult, Case, CaseStats, CaseStatus, CaseStatusHistoryEntry, CaseUserFlag, CaseUserRelationType, ListCasesResult } from "./types";

export interface ListCasesParams {
  accessToken: string;
  status?: CaseStatus;
  compartment?: Compartment;
  sensitivityLevel?: number;
  q?: string;
  limit?: number;
  offset?: number;
  sevFilter?: "s1-s2" | "overdue";
}

export async function listCases({ accessToken, status, compartment, sensitivityLevel, q, limit, offset, sevFilter }: ListCasesParams): Promise<ListCasesResult> {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (compartment) params.set("compartment", compartment);
  if (sensitivityLevel !== undefined) params.set("sensitivityLevel", String(sensitivityLevel));
  if (q) params.set("q", q);
  if (limit !== undefined) params.set("limit", String(limit));
  if (offset !== undefined) params.set("offset", String(offset));
  if (sevFilter) params.set("sevFilter", sevFilter);
  const query = params.toString();
  return backendFetch<ListCasesResult>(`/cases${query ? `?${query}` : ""}`, { accessToken });
}

export async function bulkAssignCases(accessToken: string, caseIds: string[], teamId: string): Promise<BulkCaseActionResult> {
  return backendFetch<BulkCaseActionResult>("/cases/bulk-assign", { method: "POST", body: { caseIds, teamId }, accessToken });
}

export async function bulkEscalateCases(accessToken: string, caseIds: string[], reason: string): Promise<BulkCaseActionResult> {
  return backendFetch<BulkCaseActionResult>("/cases/bulk-escalate", { method: "POST", body: { caseIds, reason }, accessToken });
}

export async function getCaseStats(accessToken: string): Promise<CaseStats> {
  return backendFetch<CaseStats>("/cases/stats", { accessToken });
}

export interface CaseSummary {
  linkedIncidentsCount: number;
  /** Added for the case-detail right rail's per-incident SLA panel — there is no case-level SLA
   * clock, only one per incident (`SlaClock.incidentId`), and a case can link to several. */
  linkedIncidents: { id: string; referenceCode: string }[];
  flagsCount: number;
  assignedTeamName: string | null;
}

export async function getCaseSummary(accessToken: string, id: string): Promise<CaseSummary> {
  return backendFetch<CaseSummary>(`/cases/${id}/summary`, { accessToken });
}

export async function getCase(accessToken: string, id: string): Promise<Case> {
  return backendFetch<Case>(`/cases/${id}`, { accessToken });
}

export interface CreateCaseInput {
  title: string;
  description: string;
  sensitivityLevel: number;
  compartment?: Compartment;
  assignedTeamId?: string;
  incidentIds?: string[];
}

export async function createCase(accessToken: string, input: CreateCaseInput): Promise<Case> {
  return backendFetch<Case>("/cases", { method: "POST", body: input, accessToken });
}

export async function updateCaseStatus(
  accessToken: string,
  id: string,
  input: { status: CaseStatus; reason?: string; approvalId?: string },
): Promise<Case> {
  return backendFetch<Case>(`/cases/${id}/status`, { method: "POST", body: input, accessToken });
}

export async function assignCaseTeam(accessToken: string, id: string, teamId: string): Promise<Case> {
  return backendFetch<Case>(`/cases/${id}/team`, { method: "POST", body: { teamId }, accessToken });
}

export async function linkIncidentToCase(accessToken: string, id: string, incidentId: string): Promise<void> {
  return backendFetch<void>(`/cases/${id}/incidents`, { method: "POST", body: { incidentId }, accessToken });
}

export async function listCaseFlags(accessToken: string, id: string): Promise<CaseUserFlag[]> {
  return backendFetch<CaseUserFlag[]>(`/cases/${id}/flags`, { accessToken });
}

export async function addCaseFlag(
  accessToken: string,
  id: string,
  input: { userId: string; type: CaseUserRelationType; reason?: string },
): Promise<CaseUserFlag> {
  return backendFetch<CaseUserFlag>(`/cases/${id}/flags`, { method: "POST", body: input, accessToken });
}

export async function removeCaseFlag(accessToken: string, id: string, flagId: string): Promise<void> {
  return backendFetch<void>(`/cases/${id}/flags/${flagId}`, { method: "DELETE", accessToken });
}

export async function listCaseStatusHistory(accessToken: string, id: string): Promise<CaseStatusHistoryEntry[]> {
  return backendFetch<CaseStatusHistoryEntry[]>(`/cases/${id}/status-history`, { accessToken });
}
