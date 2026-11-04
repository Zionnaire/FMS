export const SIGNAL_SOURCES = ["RULE_ENGINE", "CUSTOMER_COMPLAINT", "STAFF_REPORT", "WHISTLEBLOWER", "THIRD_PARTY", "MANUAL_ENTRY"] as const;
export type SignalSource = (typeof SIGNAL_SOURCES)[number];

export const SIGNAL_STATUSES = ["NEW", "VALIDATED", "REJECTED", "MERGED"] as const;
export type SignalStatus = (typeof SIGNAL_STATUSES)[number];

export interface Signal {
  id: string;
  tenantId: string;
  source: SignalSource;
  externalRef: string | null;
  summary: string;
  payload: Record<string, unknown> | null;
  status: SignalStatus;
  incidentId: string | null;
  rejectedReason: string | null;
  reportedBy: string;
  receivedAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
}

export interface ListSignalsResult {
  signals: Signal[];
  total: number;
}
