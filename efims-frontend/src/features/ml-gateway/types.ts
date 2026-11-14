export const TRANSACTION_CHANNELS = [
  "Mobile Banking", "Internet Banking", "ATM", "POS", "Branch", "USSD",
  "Card Payment", "Bank Transfer", "Agent Banking", "Corporate Banking",
] as const;

export const TRANSACTION_TYPES = [
  "Transfer", "Cash Withdrawal", "Deposit", "POS Purchase", "ATM Withdrawal",
  "Bill Payment", "Card Payment", "USSD Transfer", "Mobile Transfer", "Direct Debit",
] as const;

export const VELOCITY_INDICATORS = ["Normal", "Elevated", "High"] as const;
export type VelocityIndicator = (typeof VELOCITY_INDICATORS)[number];

export const ACCOUNT_RISK_RATINGS = ["Low", "Medium", "High"] as const;
export type AccountRiskRating = (typeof ACCOUNT_RISK_RATINGS)[number];

export interface AnomalySuggestion {
  predictionId: string;
  confidence: number;
  requiresHumanReview: boolean;
  anomalyScore: number;
  isSuspicious: boolean;
  anomalyType: string | null;
  behaviouralSignals: string[];
  disclaimer: string;
}
