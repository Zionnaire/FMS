export const RECOVERY_FRAUD_TYPES = [
  "Account Takeover", "SIM Swap", "Phishing", "Social Engineering", "Unauthorized Transfer",
  "Card-Not-Present", "POS Fraud", "ATM Fraud", "Insider Fraud", "Employee Collusion",
  "Merchant Fraud", "Beneficiary Fraud", "Identity Fraud", "Credential Compromise",
  "Device Compromise", "Mule Account", "Synthetic Identity", "Transaction Laundering",
  "Chargeback Abuse", "Corporate Compromise",
] as const;

export const RECOVERY_CHANNELS = [
  "Mobile Banking", "Internet Banking", "ATM", "POS", "Branch", "USSD",
  "Card Payment", "Bank Transfer", "Agent Banking", "Corporate Banking",
] as const;

export interface RecoveryPredictionInput {
  severity: "S1" | "S2" | "S3" | "S4";
  fraudType: string;
  channel: string;
  daysToDetection: number;
}

/** The EFIMS AI Service's recovery-probability prediction — advisory only. */
export interface RecoverySuggestion {
  predictionId: string;
  confidence: number;
  requiresHumanReview: boolean;
  recoveryProbability: number;
  recoverySuccessPrediction: boolean;
  keyFactors: string[];
  recommendedActions: string[];
  disclaimer: string;
}

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

/** `GET /recovery`'s row shape — one row per case with any loss/recovery/write-off activity,
 * backing the top-level Recoveries register page. */
export interface RecoveryRegisterRow {
  caseId: string;
  referenceCode: string;
  caseTitle: string;
  totalLoss: string;
  totalRecovered: string;
  totalWrittenOff: string;
  outstanding: string;
}
