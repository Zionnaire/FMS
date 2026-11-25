import { CdKey, Prisma, PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';

export interface ProvisionTenantInput {
  slug: string;
  name: string;
  adminEmail: string;
  adminFullName: string;
  adminPassword: string;
  /** Defaults to "General" — `prisma/seed.ts` passes "Fraud Ops Alpha" to keep `bank-1`'s
   * existing team name exactly as it was before this function existed (the upsert below keys on
   * `[tenantId, name]`, so re-running against the already-provisioned `bank-1` tenant is a no-op
   * here, same as every other upsert in this function). */
  defaultTeamName?: string;
}

export interface ProvisionTenantResult {
  tenantId: string;
  adminUserId: string;
}

/** CD-01..CD-08 working defaults, transcribed verbatim from docs/configuration-decisions.md —
 * moved here 2026-10-14 from `prisma/seed.ts` (which now imports this instead of keeping its own
 * copy) so every newly provisioned tenant starts from the exact same defaults `bank-1` did, not a
 * second hand-maintained copy that could drift. Stays DRAFT: per CLAUDE.md non-negotiable #9, only
 * the named owning function in that doc can actually ratify a CD value — provisioning a tenant is
 * not that owning function, for `bank-1` or for anyone provisioned after it. */
export const DEFAULT_CD_VALUES: Record<CdKey, Prisma.InputJsonValue> = {
  [CdKey.CD_01_INCIDENT_TAXONOMY]: {
    categories: [
      {
        name: 'Fraud',
        types: [
          { name: 'Card fraud' },
          { name: 'Internet/mobile banking fraud' },
          { name: 'ATM/POS fraud' },
          { name: 'Cheque fraud' },
          { name: 'Identity theft/impersonation' },
          { name: 'Internal (staff-perpetrated) fraud' },
          { name: 'Loan/credit fraud' },
          { name: 'Third-party/vendor fraud' },
        ],
      },
      {
        name: 'Operational Incident',
        types: [
          { name: 'Process failure' },
          { name: 'System outage/availability' },
          { name: 'Reconciliation break' },
          { name: 'Third-party/vendor failure' },
          { name: 'Data quality incident' },
        ],
      },
      {
        name: 'Cyber/Information Security',
        types: [
          { name: 'Unauthorized access' },
          { name: 'Malware/ransomware' },
          { name: 'DDoS' },
          { name: 'Data breach/exfiltration' },
          { name: 'Phishing/social engineering (customer or staff-targeted)' },
        ],
      },
      {
        name: 'Employee Misconduct',
        types: [
          { name: 'Policy violation' },
          { name: 'Conflict of interest' },
          { name: 'Harassment/conduct' },
          { name: 'Unauthorized disclosure' },
          { name: 'Insider dealing' },
        ],
      },
      {
        name: 'Whistleblowing',
        types: [{ name: 'Whistleblower report' }],
      },
      {
        name: 'Customer Complaint / Unusual Occurrence',
        types: [
          { name: 'Disputed transaction' },
          { name: 'Service failure with loss implication' },
          { name: 'Unusual pattern flagged by staff' },
        ],
      },
    ],
  },
  [CdKey.CD_02_SEVERITY_THRESHOLDS]: {
    tiers: [
      {
        tier: 'S1',
        label: 'Critical',
        financialLossThresholdNgn: null,
        customerImpact: 'Multiple customers / systemic',
        regulatoryTrigger: 'Mandatory immediate regulator notification',
        containmentUrgency: 'Immediate, 24x7',
      },
      {
        tier: 'S2',
        label: 'High',
        financialLossThresholdNgn: null,
        customerImpact: 'Single major customer or several customers',
        regulatoryTrigger: 'Regulatory reporting required within standard statutory window',
        containmentUrgency: 'Same business day',
      },
      {
        tier: 'S3',
        label: 'Medium',
        financialLossThresholdNgn: null,
        customerImpact: 'Limited, single customer',
        regulatoryTrigger: 'No immediate regulatory trigger; may require internal reporting',
        containmentUrgency: 'Within SLA, business hours acceptable',
      },
      {
        tier: 'S4',
        label: 'Low',
        financialLossThresholdNgn: null,
        customerImpact: 'None or negligible',
        regulatoryTrigger: 'None',
        containmentUrgency: 'Standard queue',
      },
    ],
  },
  [CdKey.CD_03_SLA_CALENDARS]: {
    calendars: [
      {
        name: '24x7',
        appliesTo: ['Fraud, cyber, whistleblowing intake and initial triage', 'Any case currently at S1/S2 severity regardless of type'],
      },
      {
        name: 'business_hours',
        appliesTo: ['Misconduct investigations', 'CAPA follow-up', 'Routine case administration', 'S3/S4 items'],
      },
    ],
    statutoryDeadlinesPausable: false,
    slaPauseRequiresLoggedApproval: true,
  },
  [CdKey.CD_04_APPROVAL_MATRIX]: {
    rows: [
      { action: 'Containment action', s1s2Approvers: ['Team Lead', 'Fraud Risk Manager'], s3s4Approvers: ['Team Lead'] },
      { action: 'Loss write-off', s1s2Approvers: ['CRO/Executive'], s3s4Approvers: ['Fraud Risk Manager'] },
      { action: 'Regulatory submission', s1s2Approvers: ['Compliance/MLRO', 'Legal'], s3s4Approvers: ['Compliance/MLRO'] },
      { action: 'Case closure', s1s2Approvers: ['Fraud Risk Manager'], s3s4Approvers: ['Case Owner', 'Peer review'] },
    ],
    amountBandsNgn: null,
    boardRiskCommitteeSeatAtS1WriteOffs: null,
  },
  [CdKey.CD_05_RETENTION_SCHEDULE]: {
    classes: [
      {
        recordClass: 'AML/MLRO (STR/SAR-linked) case records',
        retention: 'Minimum statutory AML retention period (commonly 5+ years post-relationship or post-closure under FATF-aligned regimes)',
        note: 'Cannot be shortened by config',
        configurable: false,
      },
      {
        recordClass: 'General fraud/incident case records',
        retention: 'Case closure + configurable years (e.g. 7 years)',
        note: 'Aligned to general banking records practice',
        configurable: true,
      },
      {
        recordClass: 'Whistleblower identity records',
        retention: 'Separate, stricter retention/access policy — identity vault kept isolated from case content',
        note: 'Joint Legal/DPO sign-off',
        configurable: false,
      },
      {
        recordClass: 'HR disciplinary records',
        retention: 'Per labour law + HR policy — separate clock from the case record',
        note: 'HR/Legal',
        configurable: false,
      },
      {
        recordClass: 'Evidence objects',
        retention: "Matches the linked case's retention class, with legal-hold override that suspends any disposal job",
        note: 'Never auto-deleted under active hold',
        configurable: false,
      },
    ],
  },
  [CdKey.CD_06_HISTORICAL_MIGRATION_SCOPE]: {
    inScope: [
      'All currently open/active cases across legacy registers',
      'Closed cases still within their retention window',
      'Open CAPAs',
      'Unresolved recoveries',
      'Anything under legal hold regardless of age',
    ],
    outOfScope: [
      'Closed cases past retention (unless a specific regulatory record must be preserved)',
      'Fully written-off/reconciled financial items with no open obligations',
    ],
    legacyTaxonomyMappingPreservesOriginalValue: true,
    cutoverDate: null,
    shadowRegisterReadOnlyTailDays: null,
  },
  [CdKey.CD_07_RTO_RPO]: {
    tiers: [
      { functionTier: 'Intake + containment-critical path', rtoTargetHours: 4, rpoTargetMinutes: 15 },
      { functionTier: 'Core case/workflow/evidence', rtoTargetHours: 24, rpoTargetMinutes: 60 },
      { functionTier: 'Regulatory reporting (deadline-aware)', rtoTargetHours: 24, rpoTargetMinutes: 60 },
      { functionTier: 'Dashboards/analytics (non-operational)', rtoTargetHours: 72, rpoTargetMinutes: 1440 },
    ],
  },
  [CdKey.CD_08_AI_USE_CASE_SCOPE]: {
    phases: [
      {
        phase: 2,
        capability: 'Severity-suggestion, duplicate-detection',
        guardrail: 'Advisory score + confidence + cited factors only; human sets final severity',
      },
      {
        phase: 3,
        capability: 'Narrative/entity extraction from free text',
        guardrail: 'Every extracted fact is source-cited back to the original text',
      },
      {
        phase: 4,
        capability: 'Anomaly/typology detection, recovery-propensity model',
        guardrail: 'Feeds triage/prioritization only — never auto-closes, auto-escalates, or auto-files a regulatory report',
      },
      {
        phase: 5,
        capability: 'Case summarisation / AI assistant',
        guardrail: 'Citations mandatory; UI must warn against treating summaries as authoritative until verified',
      },
    ],
    noAutonomousAdverseActionWithoutHumanApproval: true,
  },
};

/**
 * Creates a tenant (or no-ops if `slug` already exists — every write below is an upsert, so this
 * is safe to call again), its first `ADMIN` user with every compartment granted, one default
 * team, and CD-01..CD-08 as DRAFT v1. This is the one place that logic lives — both
 * `prisma/seed.ts` (for `bank-1`) and `PlatformModule`'s `TenantsAdminService` (for every tenant
 * provisioned after it, via `POST /platform/tenants`) call this instead of each keeping their own
 * copy. Deliberately plain (no `@Injectable()`, no NestJS DI) so a bare script with no Nest
 * application context — `seed.ts` — can call it directly; `TenantsAdminService` wraps it in one
 * line.
 *
 * Takes a single `PrismaClient` — the app-role (`efims_app`) client, same one the running
 * application always uses. This only works because `rls-policies.sql` now grants `efims_app`
 * INSERT/UPDATE on `tenants` (changed 2026-10-14 alongside this function: previously SELECT-only,
 * since tenant provisioning used to be an out-of-band `DIRECT_URL` script action, not something
 * the running app ever did to itself — see that grant's own comment). `tenants` itself is never
 * RLS-scoped, so the tenant upsert runs outside any `set_config`/transaction; everything else
 * below is tenant-scoped and runs inside one transaction with `app.current_tenant` set
 * transaction-locally first, same pattern as `PrismaService.withTenant`.
 */
export async function provisionTenant(prisma: PrismaClient, input: ProvisionTenantInput): Promise<ProvisionTenantResult> {
  const tenant = await prisma.tenant.upsert({
    where: { slug: input.slug },
    update: {},
    create: { slug: input.slug, name: input.name },
  });

  const passwordHash = await argon2.hash(input.adminPassword);
  const teamName = input.defaultTeamName ?? 'General';

  const { adminUserId } = await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant', ${tenant.id}, true)`;

      const admin = await tx.user.upsert({
        where: { tenantId_email: { tenantId: tenant.id, email: input.adminEmail } },
        update: {},
        create: {
          tenantId: tenant.id,
          email: input.adminEmail,
          passwordHash,
          fullName: input.adminFullName,
          role: Role.ADMIN,
          // Clearance 4 (maximum) is a reasonable administrative baseline on its own — it says
          // nothing about which specific protected compartments this account can see, which is a
          // content-access question, not an administrative-capability one.
          clearanceLevel: 4,
        },
      });

      // Deliberately NOT auto-granting every compartment here (this loop used to). Standing,
      // permanent, ungated access to every protected compartment — including WHISTLEBLOWING,
      // LEGAL_PRIVILEGE, HR — the moment an account is provisioned ADMIN is exactly what the
      // production-readiness review's own instructions told this project not to do: "ADMIN must
      // not silently bypass... protected compartments merely because the account is an
      // administrator." An administrator who genuinely needs to see something in a compartment
      // they're not granted requests it through the existing access-change-request flow
      // (`AccessChangeService`/`POST /users/:userId/access-change-requests` with
      // `GRANT_COMPARTMENT`, optionally time-limited via `expiresAt`) — which already requires a
      // second administrator's approval (the requester can't decide their own request) and is
      // fully audited on both the request and the decision. That is this project's real
      // break-glass mechanism; this provisioning step no longer pre-empts it.

      const team = await tx.team.upsert({
        where: { tenantId_name: { tenantId: tenant.id, name: teamName } },
        update: {},
        create: { tenantId: tenant.id, name: teamName },
      });
      await tx.teamMembership.upsert({
        where: { teamId_userId: { teamId: team.id, userId: admin.id } },
        update: {},
        create: { tenantId: tenant.id, teamId: team.id, userId: admin.id },
      });

      for (const [key, value] of Object.entries(DEFAULT_CD_VALUES) as [CdKey, Prisma.InputJsonValue][]) {
        await tx.configurationEntry.upsert({
          where: { tenantId_key_version: { tenantId: tenant.id, key, version: 1 } },
          update: {},
          create: {
            tenantId: tenant.id,
            key,
            version: 1,
            value,
            status: 'DRAFT',
            notes: 'Working default transcribed from docs/configuration-decisions.md — not yet ratified.',
            createdBy: admin.id,
          },
        });
      }

      return { adminUserId: admin.id };
    },
    // Raised from the original 30000ms — the production-hardening pass's first automated e2e
    // run hit "Transaction already closed" here reproducibly (observed at 30260ms, barely over
    // the old ceiling), the same class of Neon-latency issue `PrismaService.withTenant`'s own doc
    // comment already explains in detail. This transaction's ~11 sequential awaited writes (one
    // admin user, 6 compartment grants, one team, one membership, 8 CD-key upserts) is real work
    // against a real remote database, not an inflated number — raising the ceiling here, not
    // trimming the work, matches this project's established precedent for this exact failure mode.
    { maxWait: 15000, timeout: 60000 },
  );

  return { tenantId: tenant.id, adminUserId };
}
