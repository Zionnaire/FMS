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
}

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
