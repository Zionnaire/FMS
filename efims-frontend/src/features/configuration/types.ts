export const CD_KEYS = [
  "CD_01_INCIDENT_TAXONOMY",
  "CD_02_SEVERITY_THRESHOLDS",
  "CD_03_SLA_CALENDARS",
  "CD_04_APPROVAL_MATRIX",
  "CD_05_RETENTION_SCHEDULE",
  "CD_06_HISTORICAL_MIGRATION_SCOPE",
  "CD_07_RTO_RPO",
  "CD_08_AI_USE_CASE_SCOPE",
] as const;
export type CdKey = (typeof CD_KEYS)[number];

export const CONFIGURATION_STATUSES = ["DRAFT", "RATIFIED", "SUPERSEDED"] as const;
export type ConfigurationStatus = (typeof CONFIGURATION_STATUSES)[number];

export interface ConfigurationEntry {
  id: string;
  tenantId: string;
  key: CdKey;
  version: number;
  value: Record<string, unknown>;
  status: ConfigurationStatus;
  notes: string | null;
  effectiveDate: string | null;
  ratifiedBy: string | null;
  ratifiedAt: string | null;
  createdBy: string;
  createdAt: string;
}

export type AllCurrentConfiguration = Partial<Record<CdKey, ConfigurationEntry>>;

/** Mirrors the backend's `Cd01IncidentTaxonomy` (`modules/configuration/types/cd-value.types.ts`)
 * — the one CD value this frontend needs typed rather than treated as an opaque `Record`, since
 * the signal-validate form drives real dropdowns from it instead of a free-text field a user has
 * no way to get right (found live: "Theft" rejected with "not present in the current CD-01
 * taxonomy" from a plain text input with no indication of what the valid values even are). */
export interface IncidentTaxonomyType {
  name: string;
}
export interface IncidentTaxonomyCategory {
  name: string;
  types: IncidentTaxonomyType[];
}
export interface Cd01IncidentTaxonomy {
  categories: IncidentTaxonomyCategory[];
}

export interface ConfigurationKeyDetail {
  key: CdKey;
  current: ConfigurationEntry | null;
  history: ConfigurationEntry[];
}
