export const INVESTIGATION_PLAN_STATUSES = ["DRAFT", "ACTIVE", "COMPLETED"] as const;
export type InvestigationPlanStatus = (typeof INVESTIGATION_PLAN_STATUSES)[number];

export interface InvestigationPlan {
  id: string;
  tenantId: string;
  caseId: string;
  version: number;
  objectives: string;
  scope: string;
  status: InvestigationPlanStatus;
  createdBy: string;
  createdAt: string;
}

export const ISSUE_STATUSES = ["OPEN", "RESOLVED"] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export interface InvestigationIssue {
  id: string;
  tenantId: string;
  caseId: string;
  title: string;
  description: string;
  status: IssueStatus;
  raisedBy: string;
  raisedAt: string;
  resolution: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
}

export const INTERVIEWEE_ROLES = ["SUBJECT", "WITNESS", "STAFF", "CUSTOMER", "OTHER"] as const;
export type IntervieweeRole = (typeof INTERVIEWEE_ROLES)[number];

export interface Interview {
  id: string;
  tenantId: string;
  caseId: string;
  intervieweeName: string;
  intervieweeRole: IntervieweeRole;
  intervieweeUserId: string | null;
  conductedBy: string;
  conductedAt: string;
  summary: string;
  notes: string | null;
  createdAt: string;
}

export interface Finding {
  id: string;
  tenantId: string;
  caseId: string;
  resolvesIssueId: string | null;
  title: string;
  description: string;
  supportingEvidence: string | null;
  createdBy: string;
  createdAt: string;
}
