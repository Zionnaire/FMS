import type { Compartment } from "@/features/auth/types";

/** Mirrors `efims-backend/prisma/schema.prisma`'s `IncidentStatus` enum — see that file's own
 * doc comment on `MERGED`/`LINKED_TO_CASE` for why an incident can end up in those states. */
export const INCIDENT_STATUSES = ["OPEN", "UNDER_REVIEW", "MERGED", "REJECTED", "LINKED_TO_CASE", "CLOSED_NO_CASE"] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export interface Incident {
  id: string;
  tenantId: string;
  referenceCode: string;
  category: string;
  type: string;
  subtype: string | null;
  compartment: Compartment;
  title: string;
  description: string;
  status: IncidentStatus;
  occurredAt: string | null;
  mergedIntoIncidentId: string | null;
  caseId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  /** Structured facts the EFIMS AI Service's severity model needs — all nullable, captured via
   * `PATCH /incidents/:id/risk-factors`. `financialExposureNgn` is a Decimal on the backend,
   * serialized as a string over JSON (same convention as every other Decimal field in this app,
   * e.g. `RecoveryRegisterRow.totalLoss`). */
  financialExposureNgn: string | null;
  customerImpactCount: number | null;
  ongoingThreat: boolean | null;
  insiderInvolvement: boolean | null;
  dataCompromise: boolean | null;
  regulatoryRelevance: boolean | null;
  channel: string | null;
  reportedByType: string | null;
}

export const INCIDENT_CHANNELS = [
  "Mobile Banking", "Internet Banking", "ATM", "POS", "Branch", "USSD",
  "Card Payment", "Bank Transfer", "Agent Banking", "Corporate Banking",
] as const;

export const REPORTED_BY_TYPES = ["Customer", "Staff", "System", "Audit", "External"] as const;

export interface ListIncidentsResult {
  incidents: Incident[];
  total: number;
}

/** `GET /incidents/stats` — tenant-wide, compartment-filtered (never a raw count) KPI summary. */
export interface IncidentStats {
  total: number;
  byStatus: Record<IncidentStatus, number>;
  restrictedCompartmentCount: number;
  linkedToCaseCount: number;
}

export interface WhistleblowerIdentity {
  id: string;
  tenantId: string;
  signalId: string;
  isAnonymous: boolean;
  reporterName: string | null;
  reporterContact: string | null;
  createdAt: string;
}
