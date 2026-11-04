import { Role } from '@prisma/client';

/**
 * Single source of truth for the role lists that used to be copy-pasted verbatim across 9
 * controllers (cases, evidence, containment, capa, regulatory, recovery, investigations,
 * workflow/sla-clock, triage/signals) — found live while expanding the `Role` enum from 8 to 20
 * values (2026-10-14; see docs/CHANGELOG.md's dated entry). Extending a capability now means
 * editing one array here, not auditing every controller for its own copy.
 *
 * `ADMIN` deliberately stays in every one of these — see the `Role` enum's own doc comment in
 * schema.prisma for why its existing blanket bypass was kept rather than narrowed this pass.
 */

/** Routine case administration — the original 4-role list, now also covering the new roles whose
 * day-to-day work is a case-scoped action: `TRIAGE_ANALYST` validates/escalates toward a case,
 * `EVIDENCE_CUSTODIAN`/`SECURITY_ANALYST`/`OPERATIONS_OFFICER`/`RECOVERY_OFFICER`/`CONTROL_OWNER`
 * each own one slice of case-scoped work. Kept as one list (not split per-module) because every
 * current caller already treats "can administer this case" as one undifferentiated capability —
 * splitting it further is real future work (the capability-string model flagged as out of scope),
 * not something to half-do here. */
export const CASE_ROLES: Role[] = [
  Role.INVESTIGATOR,
  Role.TEAM_LEAD,
  Role.FRAUD_RISK_MANAGER,
  Role.CASE_OWNER,
  Role.TRIAGE_ANALYST,
  Role.EVIDENCE_CUSTODIAN,
  Role.SECURITY_ANALYST,
  Role.OPERATIONS_OFFICER,
  Role.RECOVERY_OFFICER,
  Role.CONTROL_OWNER,
  Role.ADMIN,
];

/** Bypasses `CasesService`'s team-match condition — cross-cutting oversight functions that
 * legitimately need to see cases outside their own team. `AUDITOR` added: an internal auditor's
 * whole point is cross-team assurance review, the textbook case this bypass exists for. */
export const ELEVATED_ROLES: Role[] = [
  Role.FRAUD_RISK_MANAGER,
  Role.COMPLIANCE_MLRO,
  Role.LEGAL_COUNSEL,
  Role.EXECUTIVE,
  Role.AUDITOR,
  Role.ADMIN,
];

/** Declaring someone a case subject/conflict is more consequential than routine administration —
 * narrower than `CASE_ROLES` on purpose. */
export const FLAG_ROLES: Role[] = [Role.TEAM_LEAD, Role.FRAUD_RISK_MANAGER, Role.COMPLIANCE_MLRO, Role.LEGAL_COUNSEL, Role.ADMIN];

/** Signal/triage decisions — who decides a report becomes (or doesn't become) an incident.
 * `TRIAGE_ANALYST` is the role this list exists for; kept alongside the case-admin roles that
 * already did this work rather than narrowing their access. */
export const TRIAGE_ROLES: Role[] = [Role.INVESTIGATOR, Role.TEAM_LEAD, Role.FRAUD_RISK_MANAGER, Role.TRIAGE_ANALYST, Role.ADMIN];

/** SLA clock start/stop — same population as `TRIAGE_ROLES` (whoever can triage can manage the
 * resulting clock). Pausing is narrower — see `PAUSE_ROLES`. */
export const CLOCK_ROLES: Role[] = TRIAGE_ROLES;

/** CD-03: "any SLA pause requires a logged reason and approval" — one tier up from who can simply
 * run the clock. */
export const PAUSE_ROLES: Role[] = [Role.TEAM_LEAD, Role.FRAUD_RISK_MANAGER, Role.COMPLIANCE_MLRO, Role.ADMIN];

/** Evidence legal-hold toggling — narrower than general evidence custody; a hold is a legal/
 * compliance determination, not routine custody work. */
export const LEGAL_HOLD_ROLES: Role[] = [Role.LEGAL_COUNSEL, Role.COMPLIANCE_MLRO, Role.ADMIN];

/** CAPA validation — independence matters here (`EFFECTIVENESS_REVIEWER`'s whole purpose): this
 * list is deliberately separate from `CASE_ROLES`'s `CONTROL_OWNER`, who owns the action being
 * validated, not the validation itself. */
export const CAPA_VALIDATION_ROLES: Role[] = [Role.FRAUD_RISK_MANAGER, Role.EFFECTIVENESS_REVIEWER, Role.ADMIN];

/** Audit-trail read access — oversight roles, extended with `AUDITOR` (the role this list exists
 * for) and `CONFIG_ADMIN` (governance oversight needs the same trail CD-04 does). */
export const AUDIT_READ_ROLES: Role[] = [
  Role.TEAM_LEAD,
  Role.FRAUD_RISK_MANAGER,
  Role.COMPLIANCE_MLRO,
  Role.LEGAL_COUNSEL,
  Role.EXECUTIVE,
  Role.AUDITOR,
  Role.CONFIG_ADMIN,
  Role.ADMIN,
];

/** Configuration draft/ratify — governance roles. `CONFIG_ADMIN` is the role this list exists
 * for, added alongside the existing `ADMIN`/`EXECUTIVE` pair rather than replacing them. */
export const CONFIG_ROLES: Role[] = [Role.ADMIN, Role.EXECUTIVE, Role.CONFIG_ADMIN];
