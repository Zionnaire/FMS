export const EVIDENCE_CATEGORIES = ["DOCUMENT", "SCREENSHOT", "TRANSACTION_RECORD", "SYSTEM_LOG", "STATEMENT", "COMMUNICATION", "OTHER"] as const;
export type EvidenceCategory = (typeof EVIDENCE_CATEGORIES)[number];

export const CUSTODY_ACTIONS = ["COLLECTED", "VIEWED", "EXPORTED", "TRANSFERRED", "HASH_VERIFIED"] as const;
export type CustodyAction = (typeof CUSTODY_ACTIONS)[number];

export interface CustodyEvent {
  id: string;
  tenantId: string;
  evidenceItemId: string;
  action: CustodyAction;
  actorUserId: string;
  relatedUserId: string | null;
  notes: string | null;
  occurredAt: string;
}

export interface EvidenceItem {
  id: string;
  tenantId: string;
  caseId: string;
  category: EvidenceCategory;
  title: string;
  description: string | null;
  externalRef: string | null;
  sourceSystem: string | null;
  contentHash: string;
  legalHold: boolean;
  legalHoldReason: string | null;
  legalHoldSetBy: string | null;
  legalHoldSetAt: string | null;
  collectedBy: string;
  collectedAt: string;
  createdAt: string;
  custodyEvents?: CustodyEvent[];
}

export interface VerifyEvidenceResult {
  intact: boolean;
  storedHash: string;
  recomputedHash: string;
}
