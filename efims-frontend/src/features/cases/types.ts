import type { Compartment } from "@/features/auth/types";

export const CASE_STATUSES = ["OPEN", "UNDER_INVESTIGATION", "ON_HOLD", "CLOSED"] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const CASE_USER_RELATION_TYPES = ["SUBJECT", "CONFLICT"] as const;
export type CaseUserRelationType = (typeof CASE_USER_RELATION_TYPES)[number];

export interface Case {
  id: string;
  tenantId: string;
  referenceCode: string;
  title: string;
  description: string;
  status: CaseStatus;
  sensitivityLevel: number;
  compartment: Compartment;
  assignedTeamId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

/** `GET /cases`'s row shape — the bare `Case` plus two cheap joins the list page needs
 * (`GET /cases/:id` still returns a bare `Case` — the detail page has its own lookups). */
export interface CaseListItem extends Case {
  linkedIncidentsCount: number;
  assignedTeamName: string | null;
}

export interface ListCasesResult {
  cases: CaseListItem[];
  total: number;
}

/** `GET /cases/stats` — tenant-wide, access-filtered (never a raw count) KPI summary. All
 * amounts are NGN, this codebase's one established currency precedent (see CasesService's own
 * doc comment on `CaseStats`). */
export interface CaseStats {
  total: number;
  byStatus: Record<CaseStatus, number>;
  highSensitivityCount: number;
  pendingApprovals: number;
  totalLoss: string;
  totalRecovered: string;
  outstanding: string;
  currency: "NGN";
}

export interface CaseUserFlag {
  id: string;
  tenantId: string;
  caseId: string;
  userId: string;
  type: CaseUserRelationType;
  reason: string | null;
  flaggedBy: string;
  flaggedAt: string;
}

export interface CaseStatusHistoryEntry {
  id: string;
  tenantId: string;
  caseId: string;
  fromStatus: CaseStatus | null;
  toStatus: CaseStatus;
  reason: string | null;
  changedBy: string;
  changedAt: string;
}
