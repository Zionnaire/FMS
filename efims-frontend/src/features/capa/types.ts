export const CAPA_ACTION_TYPES = ["CORRECTIVE", "PREVENTIVE"] as const;
export type CapaActionType = (typeof CAPA_ACTION_TYPES)[number];

export const CAPA_ACTION_STATUSES = ["OPEN", "IN_PROGRESS", "COMPLETED", "VALIDATED", "CANCELLED"] as const;
export type CapaActionStatus = (typeof CAPA_ACTION_STATUSES)[number];

export const CAPA_VALIDATION_OUTCOMES = ["EFFECTIVE", "PARTIALLY_EFFECTIVE", "INEFFECTIVE"] as const;
export type CapaValidationOutcome = (typeof CAPA_VALIDATION_OUTCOMES)[number];

export interface RootCauseAnalysis {
  id: string;
  tenantId: string;
  caseId: string;
  version: number;
  summary: string;
  analysisMethod: string | null;
  identifiedBy: string;
  identifiedAt: string;
}

export interface CapaAction {
  id: string;
  tenantId: string;
  caseId: string;
  rootCauseId: string | null;
  type: CapaActionType;
  title: string;
  description: string;
  status: CapaActionStatus;
  ownerId: string;
  dueDate: string;
  createdBy: string;
  createdAt: string;
  completionNotes: string | null;
  completedAt: string | null;
  cancellationReason: string | null;
  cancelledAt: string | null;
}

export interface CapaValidation {
  id: string;
  tenantId: string;
  capaActionId: string;
  outcome: CapaValidationOutcome;
  notes: string | null;
  validatedBy: string;
  validatedAt: string;
}
