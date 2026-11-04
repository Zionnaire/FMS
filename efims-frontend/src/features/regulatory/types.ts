export const OBLIGATION_TYPES = ["STR_SAR_FILING", "REGULATOR_NOTIFICATION", "OTHER"] as const;
export type ObligationType = (typeof OBLIGATION_TYPES)[number];

export const OBLIGATION_STATUSES = ["PENDING", "SUBMITTED", "ACKNOWLEDGED", "WAIVED"] as const;
export type ObligationStatus = (typeof OBLIGATION_STATUSES)[number];

export interface RegulatorySubmission {
  id: string;
  tenantId: string;
  obligationId: string;
  approvalId: string;
  referenceNumber: string | null;
  notes: string | null;
  submittedBy: string;
  submittedAt: string;
}

export interface RegulatoryObligation {
  id: string;
  tenantId: string;
  caseId: string;
  obligationType: ObligationType;
  description: string;
  regulatorName: string | null;
  deadline: string;
  status: ObligationStatus;
  identifiedBy: string;
  identifiedAt: string;
  acknowledgedRef: string | null;
  acknowledgedAt: string | null;
  waivedReason: string | null;
  waivedBy: string | null;
  waivedAt: string | null;
  submissions?: RegulatorySubmission[];
}
