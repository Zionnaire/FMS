export const SLA_CLOCK_STATUSES = ["RUNNING", "PAUSED", "STOPPED"] as const;
export type SlaClockStatus = (typeof SLA_CLOCK_STATUSES)[number];

export interface SlaClock {
  id: string;
  tenantId: string;
  incidentId: string;
  calendarName: string;
  targetDeadline: string;
  status: SlaClockStatus;
  startedBy: string;
  startedAt: string;
  pausedBy: string | null;
  pausedAt: string | null;
  pauseReason: string | null;
  totalPausedMinutes: number;
  stoppedBy: string | null;
  stoppedAt: string | null;
  breachNotifiedAt: string | null;
  /** Computed by the backend on every read, never stored — see `SlaClockService.getCurrent`. */
  isBreached: boolean;
  remainingMs: number | null;
}

export const SEVERITY_BANDS = ["S1_S2", "S3_S4"] as const;
export type SeverityBand = (typeof SEVERITY_BANDS)[number];

export const APPROVAL_ACTIONS = ["CONTAINMENT", "LOSS_WRITE_OFF", "REGULATORY_SUBMISSION", "CASE_CLOSURE"] as const;
export type ApprovalAction = (typeof APPROVAL_ACTIONS)[number];

export const APPROVAL_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export interface ApprovalRequest {
  id: string;
  tenantId: string;
  caseId: string;
  action: ApprovalAction;
  severityBand: SeverityBand;
  status: ApprovalStatus;
  requestNotes: string;
  requestedBy: string;
  requestedAt: string;
  decisionNotes: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
}

/** `GET /approvals`'s row shape — one row per approval request across every accessible case,
 * backing the top-level Approvals register page. */
export interface ApprovalRegisterRow extends ApprovalRequest {
  case: { referenceCode: string; title: string };
}
