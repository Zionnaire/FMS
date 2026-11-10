export const AUDIT_OUTCOMES = ["SUCCESS", "DENIED", "FAILURE"] as const;
export type AuditOutcome = (typeof AUDIT_OUTCOMES)[number];

export interface AuditEvent {
  id: string;
  tenantId: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  outcome: AuditOutcome;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  previousHash: string | null;
  hash: string;
}

export interface ListAuditEventsResult {
  events: AuditEvent[];
  total: number;
}

export interface ChainBreak {
  eventId: string;
  action: string;
  entityType: string;
  entityId: string | null;
  createdAt: string;
  reason: "hash_mismatch" | "link_mismatch";
}

export interface ChainVerificationResult {
  intact: boolean;
  eventsChecked: number;
  breaks: ChainBreak[];
}

export interface AuditStats {
  total: number;
  byOutcome: Record<AuditOutcome, number>;
}

export interface AuditTrendPoint {
  date: string;
  success: number;
  denied: number;
  failure: number;
}
