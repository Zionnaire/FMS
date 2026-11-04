import "server-only";
import { ApiError, backendFetch } from "@/lib/backend-client";
import type { Finding, IntervieweeRole, InvestigationIssue, InvestigationPlan, InvestigationPlanStatus, IssueStatus, Interview } from "./types";

const base = (caseId: string) => `/cases/${caseId}`;

export async function createInvestigationPlan(
  accessToken: string,
  caseId: string,
  input: { objectives: string; scope: string; status?: InvestigationPlanStatus },
): Promise<InvestigationPlan> {
  return backendFetch(`${base(caseId)}/investigation-plans`, { method: "POST", body: input, accessToken });
}

export async function listInvestigationPlans(accessToken: string, caseId: string): Promise<InvestigationPlan[]> {
  return backendFetch(`${base(caseId)}/investigation-plans`, { accessToken });
}

export async function getCurrentInvestigationPlan(accessToken: string, caseId: string): Promise<InvestigationPlan | null> {
  try {
    return await backendFetch<InvestigationPlan>(`${base(caseId)}/investigation-plans/current`, { accessToken });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function raiseIssue(accessToken: string, caseId: string, input: { title: string; description: string }): Promise<InvestigationIssue> {
  return backendFetch(`${base(caseId)}/issues`, { method: "POST", body: input, accessToken });
}

export async function listIssues(accessToken: string, caseId: string, status?: IssueStatus): Promise<InvestigationIssue[]> {
  const query = status ? `?status=${status}` : "";
  return backendFetch(`${base(caseId)}/issues${query}`, { accessToken });
}

export async function resolveIssue(accessToken: string, caseId: string, issueId: string, resolution: string): Promise<InvestigationIssue> {
  return backendFetch(`${base(caseId)}/issues/${issueId}/resolve`, { method: "POST", body: { resolution }, accessToken });
}

export async function recordInterview(
  accessToken: string,
  caseId: string,
  input: { intervieweeName: string; intervieweeRole: IntervieweeRole; intervieweeUserId?: string; conductedAt: string; summary: string; notes?: string },
): Promise<Interview> {
  return backendFetch(`${base(caseId)}/interviews`, { method: "POST", body: input, accessToken });
}

export async function listInterviews(accessToken: string, caseId: string): Promise<Interview[]> {
  return backendFetch(`${base(caseId)}/interviews`, { accessToken });
}

export async function recordFinding(
  accessToken: string,
  caseId: string,
  input: { title: string; description: string; supportingEvidence?: string; resolvesIssueId?: string },
): Promise<Finding> {
  return backendFetch(`${base(caseId)}/findings`, { method: "POST", body: input, accessToken });
}

export async function listFindings(accessToken: string, caseId: string): Promise<Finding[]> {
  return backendFetch(`${base(caseId)}/findings`, { accessToken });
}
