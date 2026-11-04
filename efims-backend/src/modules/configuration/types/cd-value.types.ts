/**
 * TypeScript shape of `ConfigurationEntry.value` for each `CdKey`, mirroring
 * docs/configuration-decisions.md section by section. These are NOT enforced by the database
 * (the column is `Json`) — `ConfigurationService` is where a value gets checked against the
 * right shape for its key before being written, via `CD_VALUE_VALIDATORS` below.
 *
 * Keeping this as a discriminated-by-key TS map rather than 8 Prisma models was a deliberate
 * choice — see the doc comment on `ConfigurationEntry` in schema.prisma.
 */
import { CdKey } from '@prisma/client';

export interface IncidentTaxonomyType {
  name: string;
  defaultSeverityProfile?: string;
  defaultRoutingTeam?: string;
  subtypes?: string[];
}

export interface IncidentTaxonomyCategory {
  name: string;
  types: IncidentTaxonomyType[];
}

/** CD-01 — Incident Taxonomy (owner: Fraud Risk) */
export interface Cd01IncidentTaxonomy {
  categories: IncidentTaxonomyCategory[];
}

export type SeverityTier = 'S1' | 'S2' | 'S3' | 'S4';

export interface SeverityTierDefinition {
  tier: SeverityTier;
  label: string;
  /** Null until the institution's risk appetite statement sets it — deliberately not invented
   * by this system, per configuration-decisions.md CD-02. */
  financialLossThresholdNgn: number | null;
  customerImpact: string;
  regulatoryTrigger: string;
  containmentUrgency: string;
}

/** CD-02 — Severity Thresholds S1-S4 (owner: Risk / Executive) */
export interface Cd02SeverityThresholds {
  tiers: SeverityTierDefinition[];
}

export interface SlaCalendarDefinition {
  name: '24x7' | 'business_hours';
  appliesTo: string[];
}

/** CD-03 — SLA Calendars (owner: Operations) */
export interface Cd03SlaCalendars {
  calendars: SlaCalendarDefinition[];
  statutoryDeadlinesPausable: false;
  slaPauseRequiresLoggedApproval: true;
}

export interface ApprovalMatrixRow {
  action: string;
  s1s2Approvers: string[];
  s3s4Approvers: string[];
}

/** CD-04 — Approval Matrix (owner: Governance) */
export interface Cd04ApprovalMatrix {
  rows: ApprovalMatrixRow[];
  /** Null until Governance sets actual bands — per configuration-decisions.md CD-04. */
  amountBandsNgn: Record<string, [number, number | null]> | null;
  boardRiskCommitteeSeatAtS1WriteOffs: boolean | null;
}

export interface RetentionClassDefinition {
  recordClass: string;
  retention: string;
  note?: string;
  configurable: boolean;
}

/** CD-05 — Retention Schedule (owner: Legal/Records) */
export interface Cd05RetentionSchedule {
  classes: RetentionClassDefinition[];
}

/** CD-06 — Historical Migration Scope (owner: Sponsor) */
export interface Cd06HistoricalMigrationScope {
  inScope: string[];
  outOfScope: string[];
  legacyTaxonomyMappingPreservesOriginalValue: true;
  cutoverDate: string | null;
  shadowRegisterReadOnlyTailDays: number | null;
}

export interface RtoRpoTierDefinition {
  functionTier: string;
  rtoTargetHours: number;
  rpoTargetMinutes: number;
}

/** CD-07 — RTO / RPO (owner: Technology) */
export interface Cd07RtoRpo {
  tiers: RtoRpoTierDefinition[];
}

export interface AiUseCasePhase {
  phase: number;
  capability: string;
  guardrail: string;
}

/** CD-08 — AI Use-Case Release Scope (owner: Model Governance) */
export interface Cd08AiUseCaseScope {
  phases: AiUseCasePhase[];
  /** Restates CLAUDE.md non-negotiable #4 inside the config payload itself, so a consumer
   * reading only this record (not the codebase) still sees the constraint. */
  noAutonomousAdverseActionWithoutHumanApproval: true;
}

export type CdValueMap = {
  [CdKey.CD_01_INCIDENT_TAXONOMY]: Cd01IncidentTaxonomy;
  [CdKey.CD_02_SEVERITY_THRESHOLDS]: Cd02SeverityThresholds;
  [CdKey.CD_03_SLA_CALENDARS]: Cd03SlaCalendars;
  [CdKey.CD_04_APPROVAL_MATRIX]: Cd04ApprovalMatrix;
  [CdKey.CD_05_RETENTION_SCHEDULE]: Cd05RetentionSchedule;
  [CdKey.CD_06_HISTORICAL_MIGRATION_SCOPE]: Cd06HistoricalMigrationScope;
  [CdKey.CD_07_RTO_RPO]: Cd07RtoRpo;
  [CdKey.CD_08_AI_USE_CASE_SCOPE]: Cd08AiUseCaseScope;
};
