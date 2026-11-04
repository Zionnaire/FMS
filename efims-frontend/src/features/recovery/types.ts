export const LOSS_CATEGORIES = ["PRINCIPAL", "FEES", "INTEREST", "OTHER"] as const;
export type LossCategory = (typeof LOSS_CATEGORIES)[number];

export const RECOVERY_METHODS = ["CUSTOMER_REFUND_REVERSAL", "INSURANCE_CLAIM", "CHARGEBACK", "THIRD_PARTY_RECOVERY", "OTHER"] as const;
export type RecoveryMethod = (typeof RECOVERY_METHODS)[number];

export interface LossEntry {
  id: string;
  tenantId: string;
  caseId: string;
  amount: string;
  category: LossCategory;
  description: string | null;
  recordedBy: string;
  recordedAt: string;
}

export interface RecoveryEntry {
  id: string;
  tenantId: string;
  caseId: string;
  amount: string;
  method: RecoveryMethod;
  description: string | null;
  recordedBy: string;
  recordedAt: string;
}

export interface WriteOffEntry {
  id: string;
  tenantId: string;
  caseId: string;
  approvalId: string;
  amount: string;
  justification: string;
  recordedBy: string;
  recordedAt: string;
}

export interface RecoverySummary {
  totalLoss: string;
  totalRecovered: string;
  totalWrittenOff: string;
  outstanding: string;
  currency: "NGN";
}
