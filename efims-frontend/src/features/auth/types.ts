/**
 * Mirrors `efims-backend/prisma/schema.prisma`'s `Role`/`Compartment` enums and
 * `src/common/types/authenticated-user.interface.ts`'s `AuthenticatedUser` shape. There is no
 * shared package between the two apps (deliberate — see the frontend README's own note on why),
 * so these are hand-kept in sync; if the backend enum ever changes, update this file in the same
 * change.
 */
/** Expanded from the original 8 to 20 (2026-10-14) — see docs/CHANGELOG.md's dated entry for the
 * full role matrix and what each one's dashboard shows. */
export const ROLES = [
  "INVESTIGATOR",
  "TEAM_LEAD",
  "FRAUD_RISK_MANAGER",
  "COMPLIANCE_MLRO",
  "LEGAL_COUNSEL",
  "CASE_OWNER",
  "EXECUTIVE",
  "ADMIN",
  "INCIDENT_REPORTER",
  "TRIAGE_ANALYST",
  "EVIDENCE_CUSTODIAN",
  "SECURITY_ANALYST",
  "OPERATIONS_OFFICER",
  "RECOVERY_OFFICER",
  "CONTROL_OWNER",
  "EFFECTIVENESS_REVIEWER",
  "HR_REVIEWER",
  "PROTECTED_DISCLOSURE_OFFICER",
  "CONFIG_ADMIN",
  "AUDITOR",
] as const;
export type Role = (typeof ROLES)[number];

export const COMPARTMENTS = ["STANDARD", "AML_MLRO", "WHISTLEBLOWING", "LEGAL_PRIVILEGE", "HR", "EXECUTIVE"] as const;
export type Compartment = (typeof COMPARTMENTS)[number];

/** The decoded access-token JWT payload — same fields the backend's own `AuthenticatedUser`
 * carries (`sub`, `tenantId`, `email`, `role`, `clearanceLevel`), plus the standard `exp`/`iat`
 * claims every JWT carries. Decoded, never re-verified here: this app trusts the token only
 * insofar as the backend itself will re-verify it on every real request; this decoded copy is
 * used solely for optimistic UI (nav labels, role-gated buttons), never as an authorization
 * decision — see `proxy.ts`'s and `session.ts`'s own doc comments. */
export interface SessionUser {
  sub: string;
  tenantId: string;
  email: string;
  role: Role;
  clearanceLevel: number;
  exp: number;
  iat: number;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    role: Role;
    clearanceLevel: number;
  };
}
