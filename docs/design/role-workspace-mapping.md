# EFIMS — Role → Workspace Mapping

**Date:** 2026-11-14. Built directly from the authoritative sources, not invented or guessed:
`efims-backend/prisma/schema.prisma`'s `Role` enum (20 values) and `efims-backend/src/common/constants/roles.ts`'s permission-list constants, cross-checked against the frontend's own mirror of those gates in `efims-frontend/src/components/shell/sidenav.tsx` and `efims-frontend/src/lib/dashboard-loaders.ts`.

**A structural note before the table**: the frontend does not build 20 separate applications. Every role renders through one of two mechanisms:
1. **4 roles get a bespoke dashboard component** (`EXECUTIVE`, `INCIDENT_REPORTER`, `ADMIN`, `CONFIG_ADMIN`) — each needs a shape the generic shell genuinely doesn't fit (an aggregate financial rollup, "my own submissions only," a user directory, a governance register).
2. **The other 16 roles share one `QueueDashboard` shell**, composed differently per role by that role's own loader in `dashboard-loaders.ts` — a different real backend call, different KPIs, a different queue. This is the "shared application shell with role-composed workspaces" the Institutional Intelligence directive asks for (Part 6) — it was already built this way during the 2026-10-14 twenty-role expansion, reconfirmed and re-skinned (not rebuilt) during this redesign pass.

**Every gate below is UX convenience only.** The frontend hiding a nav item or action is not a security control — the backend's own `@Roles()` guards, the 7-condition case-access rule, and compartment grants are what actually enforce access. A role not seeing a link here that still navigated to the route directly would get exactly the same backend-filtered (possibly empty, possibly 403) result either way.

A 21st identity, `PlatformUser`, sits entirely outside this table — see the dedicated section at the end.

---

## Workspace family groupings (per the directive's own Part 6.2 categories)

| Workspace family | Roles | Dashboard mechanism |
|---|---|---|
| Executive & governance | `EXECUTIVE` | Bespoke (`ExecutiveDashboard`) |
| Fraud monitoring & intelligence | `TRIAGE_ANALYST`, `SECURITY_ANALYST`, `OPERATIONS_OFFICER` | Shared shell |
| Investigation | `INVESTIGATOR`, `TEAM_LEAD`, `CASE_OWNER`, `FRAUD_RISK_MANAGER` | Shared shell |
| Compliance / AML-MLRO | `COMPLIANCE_MLRO` | Shared shell |
| Legal | `LEGAL_COUNSEL` | Shared shell |
| HR | `HR_REVIEWER` | Shared shell |
| Finance & recovery | `RECOVERY_OFFICER` | Shared shell |
| Audit & assurance | `AUDITOR` | Shared shell |
| Evidence / CAPA / disclosure specialists | `EVIDENCE_CUSTODIAN`, `CONTROL_OWNER`, `EFFECTIVENESS_REVIEWER`, `PROTECTED_DISCLOSURE_OFFICER` | Shared shell |
| Tenant administration | `ADMIN`, `CONFIG_ADMIN` | Bespoke |
| (No real workspace — self-service only) | `INCIDENT_REPORTER` | Bespoke, deliberately minimal |
| Platform administration | `PlatformUser` (not a `Role` value) | Entirely separate app shell (`/platform`) |

---

## Full role table

| Role | Workspace title (as shown) | Permitted modules (sidenav, role-gated) | Main actions | Restrictions |
|---|---|---|---|---|
| `EXECUTIVE` | "Executive risk overview" | Full sidenav (`ELEVATED_ROLES` + `AUDIT_READ_ROLES` + `CONFIG_ROLES` all include `EXECUTIVE`) | Review case portfolio, incident pipeline, audit trail | Read-heavy; no case-admin actions of its own (not in `CASE_ROLES`) |
| `INCIDENT_REPORTER` | "Good day." (plain fallback — see note) | Only its own submissions; explicitly excluded from every `EXCEPT_REPORTER`-gated nav item | Submit a new incident report, track its own reports | The one role with **no** enterprise case/incident browsing at all — "own reports only" by design |
| `ADMIN` | "Administration" | Every nav item (blanket bypass — present in every permission constant in `roles.ts`, by explicit design per `Role`'s own schema doc comment) | User/team provisioning, everything else | Deliberately unnarrowed — the single seeded admin is what every verification pass in this project has relied on |
| `CONFIG_ADMIN` | Configuration-focused register | `CONFIG_ROLES`, `AUDIT_READ_ROLES` | Draft/ratify CD-01–CD-08 configuration | No case-admin actions (not in `CASE_ROLES`) |
| `TRIAGE_ANALYST` | "Intake priorities" | `EXCEPT_REPORTER`, `TRIAGE_ROLES`, `CLOCK_ROLES` | Validate/reject signals, log incidents, run SLA clocks | Not in `AUDIT_READ_ROLES`/`CONFIG_ROLES`/`ELEVATED_ROLES` |
| `CASE_OWNER` | "My case desk" (rich table) | `CASE_ROLES`, `EXCEPT_REPORTER` | Open/manage cases they created | No per-user case-ownership field exists yet — "my cases" is approximated as "cases I created" (documented limitation, not a bug) |
| `INVESTIGATOR` | "Investigation desk" (rich table) | `CASE_ROLES`, `TRIAGE_ROLES`, `CLOCK_ROLES`, `EXCEPT_REPORTER` | Run investigations on cases `UNDER_INVESTIGATION` | Standard team-match condition applies (not `ELEVATED_ROLES`) |
| `TEAM_LEAD` | "Team operations" (rich table) | `CASE_ROLES`, `FLAG_ROLES`, `TRIAGE_ROLES`, `PAUSE_ROLES`, `EXCEPT_REPORTER` | Assign team cases, flag subjects/conflicts, pause SLA clocks | Team-scoped, not `ELEVATED_ROLES` |
| `FRAUD_RISK_MANAGER` | "Fraud risk oversight" (rich table) | `CASE_ROLES`, `ELEVATED_ROLES`, `FLAG_ROLES`, `TRIAGE_ROLES`, `PAUSE_ROLES`, `CAPA_VALIDATION_ROLES`, `AUDIT_READ_ROLES`, `EXCEPT_REPORTER` | Cross-team case oversight, CAPA validation, audit read | The single broadest non-admin business role |
| `EVIDENCE_CUSTODIAN` | "Custody operations" | `CASE_ROLES`, `EXCEPT_REPORTER` | Verify evidence, flag legal holds (if also in `LEGAL_HOLD_ROLES` — it is not, by itself) | Evidence-scoped only |
| `SECURITY_ANALYST` | "Security incident desk" | `CASE_ROLES`, `EXCEPT_REPORTER` | Manage cyber/infosec incidents | Not in `AUDIT_READ_ROLES`/`ELEVATED_ROLES` |
| `OPERATIONS_OFFICER` | "Operations desk" | `CASE_ROLES`, `EXCEPT_REPORTER` | Manage operational incidents | Not in `AUDIT_READ_ROLES`/`ELEVATED_ROLES` |
| `RECOVERY_OFFICER` | "Recovery ledger desk" | `CASE_ROLES`, `EXCEPT_REPORTER` | Track outstanding exposure, recovery ledger | Not in `AUDIT_READ_ROLES`/`ELEVATED_ROLES` |
| `CONTROL_OWNER` | "My corrective actions" | `CASE_ROLES`, `EXCEPT_REPORTER` | Own/complete CAPA actions | Explicitly **excluded** from `CAPA_VALIDATION_ROLES` — can't validate their own work (segregation of duties) |
| `EFFECTIVENESS_REVIEWER` | "Validation inbox" | `CAPA_VALIDATION_ROLES`, `EXCEPT_REPORTER` | Independently validate completed CAPA actions | Narrowest case-admin footprint — not in `CASE_ROLES` itself |
| `COMPLIANCE_MLRO` | "Statutory reporting desk" (rich table) | `ELEVATED_ROLES`, `PAUSE_ROLES`, `LEGAL_HOLD_ROLES`, `AUDIT_READ_ROLES`, `EXCEPT_REPORTER`; compartment `AML_MLRO` | AML/MLRO case review, regulatory reporting, legal holds | Compartment-restricted to `AML_MLRO` cases |
| `LEGAL_COUNSEL` | "Legal review desk" (rich table) | `ELEVATED_ROLES`, `FLAG_ROLES`, `LEGAL_HOLD_ROLES`, `AUDIT_READ_ROLES`, HR/legal referrals, `EXCEPT_REPORTER`; compartment `LEGAL_PRIVILEGE` | Legal-privilege case review, legal holds, HR/legal referrals | Compartment-restricted to `LEGAL_PRIVILEGE` cases |
| `HR_REVIEWER` | "Restricted HR desk" (rich table) | HR/legal referrals, `EXCEPT_REPORTER`; compartment `HR` | HR-compartment case review | Compartment-restricted to `HR` cases; not `ELEVATED_ROLES`/`AUDIT_READ_ROLES` |
| `PROTECTED_DISCLOSURE_OFFICER` | "Protected intake desk" | Protected disclosures, `EXCEPT_REPORTER` | Review whistleblower signals (metadata only) | Reporter identity held in a separate vault — never surfaced to this role |
| `AUDITOR` | "Assurance review" (rich table) | `ELEVATED_ROLES`, `AUDIT_READ_ROLES`, HR/legal referrals, protected disclosures, `EXCEPT_REPORTER` | Cross-tenant case register review, audit trail, assurance | Read-oriented; the one role besides `ADMIN` that reaches both referral compartments |

Note on `INCIDENT_REPORTER`'s dashboard title: `(app)/page.tsx`'s per-role `switch` routes it to `ReporterDashboard`, a real bespoke component — the generic "Good day." fallback referenced in older documentation is a defensive-only code path for a role drifting out of the switch, not what this role actually sees day to day.

---

## Platform administration (outside this table on purpose)

`PlatformUser` is **not** a `Role` enum value, has no `tenantId`, and is not subject to Row-Level Security — a structurally separate identity with its own JWT secret, its own login (`/platform/login`), and its own authenticated shell (`/platform/(authenticated)/`). This exists specifically so a bug in the 20-role tenant-side authorization system cannot, even in principle, grant platform-level power. Its workspace: list every tenant, provision a new one, suspend/reactivate a tenant. It has no default access to any tenant's business content (cases, incidents, signals) at all.

---

## What this confirms versus the directive's own stated risk

Part 6 of the directive warns: "Do not assume all roles should see the same dashboard... do not create 20 completely independent frontends." Both risks were already avoided before this redesign pass started — the shared-shell-with-per-role-composition architecture (`QueueDashboard` + `dashboard-loaders.ts`) and the hard platform/tenant split were both built during the 2026-10-14 role expansion, five weeks before this visual redesign began. This pass re-skinned that existing structure (new tokens, Lucide icons, the reference image's KPI/trend/severity-mix/attention/activity card composition) rather than rebuilding it, per `docs/design/frontend-redesign-assessment.md`'s own finding.
