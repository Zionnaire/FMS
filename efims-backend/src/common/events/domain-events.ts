import { ApprovalAction, ApprovalStatus, CaseStatus, SeverityBand } from '@prisma/client';

/**
 * Shared event-name constants and payload shapes for this codebase's in-process event bus
 * (architecture.md §5 — EventEmitter2, no external broker at MVP scale). Lives in `common/`,
 * owned by no single feature module — deliberately, so an emitter (e.g. `workflow`) and a
 * listener (e.g. `notifications`) both depend on this shared contract instead of one importing
 * the other's service. Every payload always carries `tenantId` explicitly: a listener triggered
 * by a scheduled job (no HTTP request, no AsyncLocalStorage tenant context) needs it to call
 * `PrismaService.withTenant` directly, and a listener triggered synchronously within a request
 * needs it for the same reason any other cross-module call in this codebase takes an explicit
 * tenant rather than assuming ambient context is safe to rely on implicitly.
 */

export const APPROVAL_REQUESTED_EVENT = 'approval.requested';
export const APPROVAL_DECIDED_EVENT = 'approval.decided';
export const CASE_STATUS_CHANGED_EVENT = 'case.status_changed';
export const SLA_CLOCK_BREACHED_EVENT = 'sla_clock.breached';

export interface ApprovalRequestedEvent {
  tenantId: string;
  approvalId: string;
  caseId: string;
  action: ApprovalAction;
  severityBand: SeverityBand;
  requestedBy: string;
  /** Resolved by `workflow`'s `ApprovalService` (it already owns `APPROVAL_MATRIX`), not by
   * `notifications` — the listener shouldn't need to know CD-04's role mapping to deliver a
   * notification to the right people. */
  notifyUserIds: string[];
}

export interface ApprovalDecidedEvent {
  tenantId: string;
  approvalId: string;
  caseId: string;
  action: ApprovalAction;
  status: ApprovalStatus;
  decidedBy: string;
  requestedBy: string;
}

export interface CaseStatusChangedEvent {
  tenantId: string;
  caseId: string;
  referenceCode: string;
  fromStatus: CaseStatus;
  toStatus: CaseStatus;
  changedBy: string;
  assignedTeamId: string | null;
}

export interface SlaClockBreachedEvent {
  tenantId: string;
  clockId: string;
  incidentId: string;
  targetDeadline: string;
}
