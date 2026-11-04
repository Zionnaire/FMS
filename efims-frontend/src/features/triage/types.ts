export const SEVERITY_TIERS = ["S1", "S2", "S3", "S4"] as const;
export type SeverityTier = (typeof SEVERITY_TIERS)[number];

export interface TriageAssessment {
  id: string;
  tenantId: string;
  incidentId: string;
  severity: SeverityTier;
  slaCalendarName: string;
  assignedTeamId: string | null;
  rationale: string;
  previousAssessmentId: string | null;
  assessedBy: string;
  assessedAt: string;
}
