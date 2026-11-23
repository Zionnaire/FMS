export const ENTITY_TYPES = ["PERSON", "COMPANY", "ACCOUNT"] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const ENTITY_IDENTIFIER_TYPES = ["BVN", "NIN", "RC_NUMBER", "TIN", "ACCOUNT_NUMBER", "OTHER"] as const;
export type EntityIdentifierType = (typeof ENTITY_IDENTIFIER_TYPES)[number];

export const ENTITY_RELATIONSHIP_TYPES = ["BENEFICIAL_OWNER", "KINSHIP", "SIGNATORY", "ASSOCIATE", "CONTROLS", "TRANSACTED_WITH", "OTHER"] as const;
export type EntityRelationshipType = (typeof ENTITY_RELATIONSHIP_TYPES)[number];

export const ENTITY_CASE_LINK_ROLES = ["SUBJECT", "BENEFICIARY", "COUNTERPARTY", "WITNESS", "OTHER"] as const;
export type EntityCaseLinkRole = (typeof ENTITY_CASE_LINK_ROLES)[number];

/** Reuses the backend's own `SeverityTier` (S1-S4) for risk banding — CD-02's severity language,
 * adapted here, not an unrelated 0-100 scale (see EntityRiskAssessment's own schema.prisma doc
 * comment). */
export const RISK_BANDS = ["S1", "S2", "S3", "S4"] as const;
export type RiskBand = (typeof RISK_BANDS)[number];

export const RISK_BAND_LABEL: Record<RiskBand, string> = { S1: "S1 CRITICAL", S2: "S2 HIGH", S3: "S3 MEDIUM", S4: "S4 LOW" };
export const RISK_BAND_COLOR: Record<RiskBand, string> = {
  S1: "var(--color-severity-s1)",
  S2: "var(--color-severity-s2)",
  S3: "var(--color-severity-s3)",
  S4: "var(--color-severity-s4)",
};

export interface Entity {
  id: string;
  tenantId: string;
  type: EntityType;
  displayName: string;
  watchlisted: boolean;
  watchlistReason: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface EntityIdentifier {
  id: string;
  entityId: string;
  type: EntityIdentifierType;
  value: string;
  verified: boolean;
  createdBy: string;
  createdAt: string;
}

export interface EntityRelationship {
  id: string;
  fromEntityId: string;
  toEntityId: string;
  relationshipType: EntityRelationshipType;
  rationale: string | null;
  createdBy: string;
  createdAt: string;
}

/** A case link the requesting viewer can actually see — a case outside their access is omitted
 * entirely by the backend, never sent redacted or counted (see EntitiesService's own doc comment
 * on `filterVisibleCaseLinks` for why). */
export interface VisibleCaseLink {
  caseId: string;
  referenceCode: string;
  title: string;
  role: EntityCaseLinkRole;
  linkedAt: string;
}

export interface RiskFactor {
  label: string;
  weight: number;
  rationale: string;
}

export interface EntityRiskAssessment {
  id: string;
  entityId: string;
  band: RiskBand;
  factors: RiskFactor[];
  source: "MANUAL" | "ML_SUGGESTED";
  previousAssessmentId: string | null;
  assessedBy: string;
  assessedAt: string;
}

export interface EntityDetail extends Entity {
  identifiers: EntityIdentifier[];
  relationships: EntityRelationship[];
  riskAssessments: EntityRiskAssessment[];
  caseLinks: VisibleCaseLink[];
}

export interface GraphNode {
  id: string;
  type: EntityType;
  displayName: string;
  watchlisted: boolean;
  depth: number;
  visibleCaseCount: number;
}

export interface GraphEdge {
  id: string;
  fromEntityId: string;
  toEntityId: string;
  relationshipType: EntityRelationshipType;
}

export interface EntityGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
