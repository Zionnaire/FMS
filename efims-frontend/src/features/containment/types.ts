export const CONTAINMENT_ACTION_TYPES = ["FREEZE_ACCOUNT", "BLOCK_CARD", "SUSPEND_ACCESS", "HOLD_TRANSACTION", "OTHER"] as const;
export type ContainmentActionType = (typeof CONTAINMENT_ACTION_TYPES)[number];

export const CONTAINMENT_STATUSES = ["REQUESTED", "CONFIRMED", "REJECTED", "CANCELLED"] as const;
export type ContainmentStatus = (typeof CONTAINMENT_STATUSES)[number];

export interface ContainmentRequest {
  id: string;
  tenantId: string;
  caseId: string;
  approvalId: string;
  actionType: ContainmentActionType;
  targetDescription: string;
  rationale: string;
  status: ContainmentStatus;
  requestedBy: string;
  requestedAt: string;
  confirmationRef: string | null;
  confirmedAt: string | null;
  rejectionReason: string | null;
  rejectedAt: string | null;
  cancelledBy: string | null;
  cancellationReason: string | null;
  cancelledAt: string | null;
}
