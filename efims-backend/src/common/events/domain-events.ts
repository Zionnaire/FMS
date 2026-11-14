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
export const TASK_ASSIGNED_EVENT = 'task.assigned';
export const CASE_ESCALATED_EVENT = 'case.escalated';

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

export interface TaskAssignedEvent {
  tenantId: string;
  taskId: string;
  caseId: string;
  title: string;
  assigneeUserId: string;
  dueAt: string | null;
  assignedBy: string;
}

/** Fired once per `CasesService.bulkEscalate` call (not once per case) — carries every case in
 * the batch so `NotificationsService`'s handler can resolve each one's team lead(s) without N
 * separate event round-trips. Deliberately a distinct event from `CaseStatusChangedEvent`: that
 * one fires on every status change and only reacts to `CLOSED`; a bulk-escalate is a deliberate
 * "this needs attention now" action, not every incidental move to `UNDER_INVESTIGATION` (e.g. a
 * case owner routinely progressing their own case shouldn't notify a team lead every time). */
export interface CaseEscalatedEvent {
  tenantId: string;
  escalatedBy: string;
  reason: string;
  cases: { caseId: string; referenceCode: string; assignedTeamId: string | null }[];
}
