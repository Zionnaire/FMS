/**
 * Bootstrap seed: one tenant (Bank 1) + one ADMIN user, so there's something to log in as
 * before a real onboarding/admin-console flow exists.
 *
 * Must run AFTER `npm run prisma:migrate:dev` and `npm run db:rls`.
 *
 * The tenant/admin/team/CD-01..08 bootstrap itself is `provisionTenant` (`src/platform/
 * tenant-provisioning.ts`), added 2026-10-14 alongside the platform/super-admin layer — this
 * script calls it for `bank-1` exactly like `PlatformModule`'s `TenantsAdminService` calls it for
 * any tenant provisioned after it, instead of keeping its own copy. `provisionTenant` runs
 * entirely against the app-role (`efims_app`) client now (`rls-policies.sql` grants it
 * INSERT/UPDATE on `tenants` as of the same change) — the separate `DIRECT_URL`-backed
 * `provisioningClient` this script used to need for the tenant row specifically no longer exists.
 *
 * The demo signal/incident/case/.../regulatory-obligation data below `provisionTenant`'s return
 * is `bank-1`-specific flavor, not part of what a newly provisioned tenant gets — it stays here,
 * not in the shared function.
 *
 * IMPORTANT — `set_config('app.current_tenant', ..., true)` (transaction-LOCAL), inside a
 * `$transaction`, never session-level (`false`) outside one: proven live against Neon's pooled
 * endpoint (PgBouncer) during this module's own verification that session-level `set_config`
 * LEAKS tenant context across completely unrelated client connections reusing the same pooled
 * backend — a real cross-tenant data exposure, not a theoretical one. Transaction-local scope is
 * safe because Postgres resets it at commit/rollback regardless of what the pooler does with the
 * underlying connection afterward. This mirrors `PrismaService.withTenant`/`forCurrentTenant` in
 * the app itself, which already used the transaction-local form.
 */
import { createHash } from 'node:crypto';
import {
  PrismaClient,
  Compartment,
  Prisma,
  Role,
  SignalSource,
  SignalStatus,
  IncidentStatus,
  CaseStatus,
  SlaClockStatus,
  ApprovalAction,
  SeverityBand,
  ApprovalStatus,
  UserStatus,
} from '@prisma/client';
import * as argon2 from 'argon2';
import { provisionTenant } from '../src/platform/tenant-provisioning';

const prisma = new PrismaClient();

/** One seed user per *new* role added in the 2026-10-14 expansion (`ADMIN` already has the
 * bootstrap admin from `provisionTenant`; `CASE_OWNER`/`INVESTIGATOR`/`TEAM_LEAD`/
 * `FRAUD_RISK_MANAGER`/`COMPLIANCE_MLRO`/`LEGAL_COUNSEL`/`EXECUTIVE` existed before this pass but
 * had never actually had a seeded user wearing them until now either — every one of the 8
 * pre-existing roles gets a real user here too, so there's something to log into and exercise
 * every dashboard with, not just the newly-added 12). All share the one seeded password so the
 * login credentials are easy to find (see `efims-frontend/README.md`'s Setup section, updated in
 * the same change) — this is seed data for a local dev tenant, not a production provisioning
 * flow (that's `CreateUserDto.temporaryPassword`, a per-user value, via `POST /users`).
 */
const ROLE_SEED_PASSWORD = 'ChangeMe123!';
const ROLE_USERS: { role: Role; email: string; fullName: string; clearanceLevel: number; compartments: Compartment[] }[] = [
  { role: Role.INCIDENT_REPORTER, email: 'reporter@bank1.efims.local', fullName: 'Amaka Reporter', clearanceLevel: 1, compartments: [] },
  { role: Role.TRIAGE_ANALYST, email: 'triage@bank1.efims.local', fullName: 'Chidi Triage', clearanceLevel: 2, compartments: [] },
  { role: Role.CASE_OWNER, email: 'caseowner@bank1.efims.local', fullName: 'Femi Caseowner', clearanceLevel: 2, compartments: [] },
  { role: Role.INVESTIGATOR, email: 'investigator@bank1.efims.local', fullName: 'Ifeoma Investigator', clearanceLevel: 2, compartments: [] },
  { role: Role.TEAM_LEAD, email: 'teamlead@bank1.efims.local', fullName: 'Tunde Teamlead', clearanceLevel: 3, compartments: [] },
  { role: Role.FRAUD_RISK_MANAGER, email: 'fraudrisk@bank1.efims.local', fullName: 'Ngozi Fraudrisk', clearanceLevel: 3, compartments: [] },
  { role: Role.EVIDENCE_CUSTODIAN, email: 'custodian@bank1.efims.local', fullName: 'Bola Custodian', clearanceLevel: 2, compartments: [] },
  { role: Role.SECURITY_ANALYST, email: 'security@bank1.efims.local', fullName: 'Kemi Security', clearanceLevel: 2, compartments: [] },
  { role: Role.OPERATIONS_OFFICER, email: 'operations@bank1.efims.local', fullName: 'Seun Operations', clearanceLevel: 2, compartments: [] },
  { role: Role.RECOVERY_OFFICER, email: 'recovery@bank1.efims.local', fullName: 'Yemi Recovery', clearanceLevel: 2, compartments: [] },
  { role: Role.CONTROL_OWNER, email: 'controlowner@bank1.efims.local', fullName: 'Dapo Controlowner', clearanceLevel: 2, compartments: [] },
  { role: Role.EFFECTIVENESS_REVIEWER, email: 'reviewer@bank1.efims.local', fullName: 'Hauwa Reviewer', clearanceLevel: 3, compartments: [] },
  { role: Role.COMPLIANCE_MLRO, email: 'mlro@bank1.efims.local', fullName: 'Grace Mlro', clearanceLevel: 4, compartments: [Compartment.AML_MLRO] },
  { role: Role.LEGAL_COUNSEL, email: 'legal@bank1.efims.local', fullName: 'Emeka Legal', clearanceLevel: 4, compartments: [Compartment.LEGAL_PRIVILEGE] },
  { role: Role.HR_REVIEWER, email: 'hr@bank1.efims.local', fullName: 'Fatima Hr', clearanceLevel: 3, compartments: [Compartment.HR] },
  {
    role: Role.PROTECTED_DISCLOSURE_OFFICER,
    email: 'disclosure@bank1.efims.local',
    fullName: 'Obinna Disclosure',
    clearanceLevel: 3,
    compartments: [Compartment.WHISTLEBLOWING],
  },
  { role: Role.EXECUTIVE, email: 'executive@bank1.efims.local', fullName: 'Adaeze Executive', clearanceLevel: 4, compartments: [Compartment.EXECUTIVE] },
  { role: Role.CONFIG_ADMIN, email: 'configadmin@bank1.efims.local', fullName: 'Rotimi Configadmin', clearanceLevel: 3, compartments: [] },
  {
    role: Role.AUDITOR,
    email: 'auditor@bank1.efims.local',
    fullName: 'Blessing Auditor',
    clearanceLevel: 4,
    compartments: [Compartment.AML_MLRO, Compartment.LEGAL_PRIVILEGE, Compartment.HR, Compartment.EXECUTIVE, Compartment.WHISTLEBLOWING],
  },
];

async function seedRoleUsers(tx: Prisma.TransactionClient, tenant: { id: string }, teamId: string): Promise<void> {
  const passwordHash = await argon2.hash(ROLE_SEED_PASSWORD);
  for (const def of ROLE_USERS) {
    const user = await tx.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: def.email } },
      update: {},
      create: {
        tenantId: tenant.id,
        email: def.email,
        passwordHash,
        fullName: def.fullName,
        role: def.role,
        clearanceLevel: def.clearanceLevel,
      },
    });
    // STANDARD is visible to everyone by default (see Compartment's own doc comment) — only
    // granting the extra, role-specific compartments here, same as `provisionTenant`'s own
    // "grant exactly what's needed" reasoning, not blanket-granting everything the way the
    // bootstrap admin does.
    for (const compartment of def.compartments) {
      await tx.userCompartmentGrant.upsert({
        where: { userId_compartment: { userId: user.id, compartment } },
        update: {},
        create: { tenantId: tenant.id, userId: user.id, compartment },
      });
    }
    await tx.teamMembership.upsert({
      where: { teamId_userId: { teamId, userId: user.id } },
      update: {},
      create: { tenantId: tenant.id, teamId, userId: user.id },
    });
  }
  console.log(`Seeded ${ROLE_USERS.length} role users (one per role added 2026-10-14, plus the 7 pre-existing roles) — password: ${ROLE_SEED_PASSWORD}`);
}

/** One platform/super-admin account (`src/platform/`) — structurally separate from every tenant
 * `User` above (no `tenantId`, not RLS-scoped; see `PlatformUser`'s own doc comment). */
async function seedPlatformUser(): Promise<void> {
  const email = 'superadmin@efims.platform';
  const passwordHash = await argon2.hash('ChangeMe123!');
  await prisma.platformUser.upsert({
    where: { email },
    update: {},
    create: { email, passwordHash, fullName: 'EFIMS Platform Super Admin', status: UserStatus.ACTIVE },
  });
  console.log(`Seeded platform super-admin ${email} (password: ChangeMe123!)`);
}

async function main() {
  const { tenantId, adminUserId } = await provisionTenant(prisma, {
    slug: 'bank-1',
    name: 'Bank 1',
    adminEmail: 'admin@bank1.efims.local',
    adminFullName: 'EFIMS Bootstrap Admin',
    adminPassword: 'ChangeMe123!',
    defaultTeamName: 'Fraud Ops Alpha',
  });
  console.log('Seeded tenant bank-1 with admin user admin@bank1.efims.local (password: ChangeMe123!)');
  console.log('Seeded CD-01..CD-08 working defaults as DRAFT v1 (unratified).');

  const tenant = { id: tenantId, slug: 'bank-1' };

  // Role users run in their own transaction, separate from the demo-data one below — they don't
  // depend on any of it (no case/incident references), just the team `provisionTenant` already
  // created. 20 users x 3 writes each (user/compartments/team-membership) over real network round
  // trips to Neon exceeded a 30s budget live on the first run — same "this project's own
  // documented transaction-timeout growth pattern" as the demo-data transaction below, not a bug.
  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant', ${tenant.id}, true)`;
      const team = await tx.team.findUniqueOrThrow({ where: { tenantId_name: { tenantId: tenant.id, name: 'Fraud Ops Alpha' } } });
      await seedRoleUsers(tx, tenant, team.id);
    },
    { maxWait: 10000, timeout: 90000 },
  );

  await seedPlatformUser();

  // `bank-1`-specific demo data runs in its own transaction, re-setting tenant context —
  // `provisionTenant`'s own transaction already committed and closed by the time we get here.
  //
  // `timeout` has grown twice now (30s -> 90s) as more modules' worth of seed data joined this
  // one transaction — seeding signal/incident/triage/case/workflow/investigation data
  // sequentially, each a real round trip to Neon, genuinely adds up. Caught live: a run failed
  // with `P2028 Transaction already closed` the first time the investigations seeding was added,
  // not a bug in that new code, just this budget catching up to how much the script now does in
  // one atomic pass. Bump this again if a future module's seed data pushes past it.
  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant', ${tenant.id}, true)`;
      await seedDemoData(tx, tenant, adminUserId);
    },
    { maxWait: 10000, timeout: 90000 },
  );
}

async function seedDemoData(tx: Prisma.TransactionClient, tenant: { id: string; slug: string }, adminUserId: string) {
  const admin = { id: adminUserId };

  // Two demo Signal -> Incident pairs so the incidents module has something to look at from
  // the moment this seed runs, without needing a live client to POST through the API first.
  // Written directly against Prisma rather than through SignalsService/IncidentsService (this
  // script has no NestJS DI container to resolve them from) — mirrors, by hand, what those
  // services would produce: a VALIDATED signal pointing at the Incident it became. This bypasses
  // the services' own referenceCode-collision handling and CD-01 taxonomy validation, so it is
  // not a substitute for exercising the real `POST /signals` -> `POST /signals/:id/validate`
  // flow, only a convenience for having non-empty data to browse.

  // Upsert-based (idempotent regardless of which sub-step previously completed), unlike the
  // "skip the whole block if the signal exists" style below — this one also seeds a triage
  // assessment as a separate follow-on step, so each piece needs its own existence check.
  const standardIncident = await tx.incident.upsert({
    where: { tenantId_referenceCode: { tenantId: tenant.id, referenceCode: 'INC-2026-0001' } },
    update: {},
    create: {
      tenantId: tenant.id,
      referenceCode: 'INC-2026-0001',
      category: 'Fraud',
      type: 'Card fraud',
      compartment: Compartment.STANDARD,
      title: 'Unauthorized card transaction reported by customer',
      description:
        'Customer reports a ₦450,000 card transaction they did not authorize, flagged via the contact centre.',
      status: IncidentStatus.OPEN,
      createdBy: admin.id,
    },
  });

  const standardSignal = await tx.signal.findFirst({
    where: { tenantId: tenant.id, externalRef: 'SEED-DEMO-001' },
  });
  if (!standardSignal) {
    await tx.signal.create({
      data: {
        tenantId: tenant.id,
        source: SignalSource.CUSTOMER_COMPLAINT,
        externalRef: 'SEED-DEMO-001',
        summary: 'Customer disputes a ₦450,000 card transaction as unauthorized',
        status: SignalStatus.VALIDATED,
        incidentId: standardIncident.id,
        reportedBy: admin.id,
        reviewedBy: admin.id,
        reviewedAt: new Date(),
      },
    });
  }

  // One demo TriageAssessment, on the STANDARD incident only — the WHISTLEBLOWING one is left
  // un-triaged on purpose, so the seed data shows both states (triaged vs. still awaiting
  // triage) rather than everything already processed.
  const existingAssessment = await tx.triageAssessment.findFirst({ where: { incidentId: standardIncident.id } });
  if (!existingAssessment) {
    const fraudOpsTeam = await tx.team.findUnique({
      where: { tenantId_name: { tenantId: tenant.id, name: 'Fraud Ops Alpha' } },
    });
    await tx.triageAssessment.create({
      data: {
        tenantId: tenant.id,
        incidentId: standardIncident.id,
        severity: 'S2',
        slaCalendarName: '24x7',
        assignedTeamId: fraudOpsTeam?.id,
        rationale: 'Single customer, confirmed unauthorized card transaction — S2 per CD-02, 24x7 calendar pending recovery/containment review.',
        assessedBy: admin.id,
      },
    });
    await tx.incident.update({ where: { id: standardIncident.id }, data: { status: IncidentStatus.UNDER_REVIEW } });
  }

  // One demo Case, opened against the STANDARD incident — again the WHISTLEBLOWING incident is
  // left un-linked on purpose (still just triaged, not yet escalated to a case), so the seed
  // data spans all three stages: raw signal only, triaged incident, and a linked case.
  const fraudOpsTeamForCase = await tx.team.findUnique({
    where: { tenantId_name: { tenantId: tenant.id, name: 'Fraud Ops Alpha' } },
  });
  const demoCase = await tx.case.upsert({
    where: { tenantId_referenceCode: { tenantId: tenant.id, referenceCode: 'CASE-2026-0001' } },
    update: {},
    create: {
      tenantId: tenant.id,
      referenceCode: 'CASE-2026-0001',
      title: 'Card fraud investigation — customer 450k',
      description:
        'Investigating the unauthorized card transaction pattern surfaced by INC-2026-0001, escalated from triage for formal investigation.',
      sensitivityLevel: 2,
      compartment: Compartment.STANDARD,
      assignedTeamId: fraudOpsTeamForCase?.id,
      createdBy: admin.id,
    },
  });
  const existingCaseHistory = await tx.caseStatusHistory.findFirst({ where: { caseId: demoCase.id } });
  if (!existingCaseHistory) {
    await tx.caseStatusHistory.create({
      data: { tenantId: tenant.id, caseId: demoCase.id, fromStatus: null, toStatus: CaseStatus.OPEN, changedBy: admin.id },
    });
  }
  if (standardIncident.caseId !== demoCase.id) {
    await tx.incident.update({
      where: { id: standardIncident.id },
      data: { caseId: demoCase.id, status: IncidentStatus.LINKED_TO_CASE },
    });
  }

  // One demo SlaClock (already STOPPED) on the STANDARD incident, and one demo ApprovalRequest
  // (CASE_CLOSURE, APPROVED) on the demo case, which — since it's approved — also closes the
  // case here, exactly mirroring the real assess -> escalate -> request -> decide -> close flow
  // this module's own live verification exercised through the actual API.
  const existingClock = await tx.slaClock.findFirst({ where: { incidentId: standardIncident.id } });
  if (!existingClock) {
    await tx.slaClock.create({
      data: {
        tenantId: tenant.id,
        incidentId: standardIncident.id,
        calendarName: '24x7',
        targetDeadline: new Date(Date.now() + 2 * 60 * 60 * 1000),
        status: SlaClockStatus.STOPPED,
        startedBy: admin.id,
        stoppedBy: admin.id,
        stoppedAt: new Date(),
      },
    });
  }

  const existingApproval = await tx.approvalRequest.findFirst({
    where: { caseId: demoCase.id, action: ApprovalAction.CASE_CLOSURE },
  });
  if (!existingApproval) {
    await tx.approvalRequest.create({
      data: {
        tenantId: tenant.id,
        caseId: demoCase.id,
        action: ApprovalAction.CASE_CLOSURE,
        severityBand: SeverityBand.S1_S2,
        status: ApprovalStatus.APPROVED,
        requestNotes: 'Investigation complete, customer refunded, no further action needed.',
        requestedBy: admin.id,
        decisionNotes: 'Confirmed refund processed, no outstanding actions.',
        decidedBy: admin.id,
        decidedAt: new Date(),
      },
    });
    if (demoCase.status !== CaseStatus.CLOSED) {
      await tx.case.update({ where: { id: demoCase.id }, data: { status: CaseStatus.CLOSED, closedAt: new Date() } });
      await tx.caseStatusHistory.create({
        data: {
          tenantId: tenant.id,
          caseId: demoCase.id,
          fromStatus: demoCase.status,
          toStatus: CaseStatus.CLOSED,
          reason: 'Closed per approved CASE_CLOSURE request.',
          changedBy: admin.id,
        },
      });
    }
  }

  const whistleblowerSignal = await tx.signal.findFirst({
    where: { tenantId: tenant.id, externalRef: 'SEED-DEMO-002' },
  });
  if (!whistleblowerSignal) {
    const incident = await tx.incident.upsert({
      where: { tenantId_referenceCode: { tenantId: tenant.id, referenceCode: 'INC-2026-0002' } },
      update: {},
      create: {
        tenantId: tenant.id,
        referenceCode: 'INC-2026-0002',
        category: 'Whistleblowing',
        type: 'Whistleblower report',
        compartment: Compartment.WHISTLEBLOWING,
        title: 'Anonymous report of suspected internal loan approval irregularity',
        description:
          'Anonymous whistleblower alleges a branch officer approved loans for relatives without proper disclosure.',
        status: IncidentStatus.OPEN,
        createdBy: admin.id,
      },
    });

    const signal = await tx.signal.create({
      data: {
        tenantId: tenant.id,
        source: SignalSource.WHISTLEBLOWER,
        externalRef: 'SEED-DEMO-002',
        summary: 'Anonymous tip alleging undisclosed-relative loan approvals at a branch',
        status: SignalStatus.VALIDATED,
        incidentId: incident.id,
        reportedBy: admin.id,
        reviewedBy: admin.id,
        reviewedAt: new Date(),
      },
    });

    // Identity vault entry lives in its own table even for an "anonymous" report — see
    // WhistleblowerVaultService's doc comment on why isAnonymous itself is still a fact worth
    // recording there rather than inferred from an absent row.
    await tx.whistleblowerIdentityVaultEntry.create({
      data: { tenantId: tenant.id, signalId: signal.id, isAnonymous: true },
    });
  }

  // One demo investigation thread on the STANDARD case — a plan, a raised-and-resolved issue,
  // an interview, and a finding that resolves the issue — so the seed data demonstrates the
  // full "plans, issues, interviews, findings" shape, not just the schema existing.
  const existingPlan = await tx.investigationPlan.findFirst({ where: { caseId: demoCase.id } });
  if (!existingPlan) {
    await tx.investigationPlan.create({
      data: {
        tenantId: tenant.id,
        caseId: demoCase.id,
        version: 1,
        objectives: 'Determine whether the disputed card transaction was genuinely unauthorized.',
        scope: 'Review transaction logs, contact the customer, check for SIM-swap indicators with the telco.',
        status: 'ACTIVE',
        createdBy: admin.id,
      },
    });

    const issue = await tx.investigationIssue.create({
      data: {
        tenantId: tenant.id,
        caseId: demoCase.id,
        title: "Was the customer's SIM swapped before the transaction?",
        description: 'Telco records need to be checked for a SIM-swap event in the 48h window before the disputed transaction.',
        raisedBy: admin.id,
      },
    });

    await tx.interview.create({
      data: {
        tenantId: tenant.id,
        caseId: demoCase.id,
        intervieweeName: 'Jane Customer',
        intervieweeRole: 'CUSTOMER',
        conductedBy: admin.id,
        conductedAt: new Date(),
        summary: 'Customer confirms she never authorized the transaction and received a SIM-swap notification SMS the day before.',
      },
    });

    await tx.finding.create({
      data: {
        tenantId: tenant.id,
        caseId: demoCase.id,
        resolvesIssueId: issue.id,
        title: 'SIM-swap confirmed',
        description: 'Telco confirmed a SIM-swap request 18 hours before the disputed transaction.',
        supportingEvidence: 'Telco incident report #TC-88213',
        createdBy: admin.id,
      },
    });

    await tx.investigationIssue.update({
      where: { id: issue.id },
      data: {
        status: 'RESOLVED',
        resolution: 'Confirmed via telco records and the SIM-swap finding — the transaction was genuinely unauthorized.',
        resolvedBy: admin.id,
        resolvedAt: new Date(),
      },
    });
  }

  // One demo evidence item on the STANDARD case — ingested with a real SHA-256 hash of its
  // content, a COLLECTED custody event auto-logged at ingest (matching what
  // `EvidenceService.ingest` does), a second custody event recording that it was viewed, and a
  // hash verification that confirms it's intact (re-hashing the same content the item was
  // ingested with) — so the seed data demonstrates the full "vault, hashing, custody" shape.
  const existingEvidenceItem = await tx.evidenceItem.findFirst({ where: { caseId: demoCase.id } });
  if (!existingEvidenceItem) {
    const telcoReportContent = 'Telco incident report #TC-88213: SIM-swap request confirmed 18h before the disputed transaction.';
    const evidenceItem = await tx.evidenceItem.create({
      data: {
        tenantId: tenant.id,
        caseId: demoCase.id,
        category: 'DOCUMENT',
        title: 'Telco SIM-swap incident report #TC-88213',
        description: 'Confirms a SIM-swap request in the 48h window before the disputed card transaction.',
        externalRef: 'dms://bank1/evidence/TC-88213.pdf',
        sourceSystem: 'Telco incident portal',
        contentHash: createHash('sha256').update(telcoReportContent, 'utf8').digest('hex'),
        collectedBy: admin.id,
      },
    });

    await tx.custodyEvent.create({
      data: { tenantId: tenant.id, evidenceItemId: evidenceItem.id, action: 'COLLECTED', actorUserId: admin.id },
    });
    await tx.custodyEvent.create({
      data: {
        tenantId: tenant.id,
        evidenceItemId: evidenceItem.id,
        action: 'VIEWED',
        actorUserId: admin.id,
        notes: 'Reviewed while drafting the SIM-swap finding.',
      },
    });
    await tx.custodyEvent.create({
      data: {
        tenantId: tenant.id,
        evidenceItemId: evidenceItem.id,
        action: 'HASH_VERIFIED',
        actorUserId: admin.id,
        notes: 'Hash verified: content matches ingest-time hash.',
      },
    });
  }

  // One demo containment thread on the STANDARD case — an APPROVED CONTAINMENT approval request
  // (mirroring the CASE_CLOSURE one above) referenced by a ContainmentRequest that has already
  // been CONFIRMED by the (simulated) source system, demonstrating CLAUDE.md non-negotiable #8's
  // full "request -> wait -> confirm" shape, not just the schema existing.
  const existingContainmentApproval = await tx.approvalRequest.findFirst({
    where: { caseId: demoCase.id, action: ApprovalAction.CONTAINMENT },
  });
  if (!existingContainmentApproval) {
    const containmentApproval = await tx.approvalRequest.create({
      data: {
        tenantId: tenant.id,
        caseId: demoCase.id,
        action: ApprovalAction.CONTAINMENT,
        severityBand: SeverityBand.S1_S2,
        status: ApprovalStatus.APPROVED,
        requestNotes: 'Card compromised via SIM-swap fraud — request a block before further unauthorized use.',
        requestedBy: admin.id,
        decisionNotes: 'Approved — block the card immediately.',
        decidedBy: admin.id,
        decidedAt: new Date(),
      },
    });

    const containmentRequest = await tx.containmentRequest.create({
      data: {
        tenantId: tenant.id,
        caseId: demoCase.id,
        approvalId: containmentApproval.id,
        actionType: 'BLOCK_CARD',
        targetDescription: "Customer's card ending 4471",
        rationale: 'SIM-swap confirmed by telco; card must be blocked to prevent further unauthorized transactions.',
        requestedBy: admin.id,
      },
    });

    await tx.containmentRequest.update({
      where: { id: containmentRequest.id },
      data: { status: 'CONFIRMED', confirmationRef: 'CARDSYS-REF-889214', confirmedAt: new Date() },
    });
  }

  // One demo loss/recovery/write-off thread on the STANDARD case — a ₦450,000 loss, a ₦150,000
  // chargeback recovery, and an approved LOSS_WRITE_OFF covering the remaining ₦300,000, so the
  // seed data demonstrates the full ledger + reconciliation shape (outstanding == 0), not just
  // the schema existing.
  const existingLoss = await tx.lossEntry.findFirst({ where: { caseId: demoCase.id } });
  if (!existingLoss) {
    await tx.lossEntry.create({
      data: {
        tenantId: tenant.id,
        caseId: demoCase.id,
        amount: 450000,
        category: 'PRINCIPAL',
        description: 'Unauthorized card transaction amount, customer 450k.',
        recordedBy: admin.id,
      },
    });

    await tx.recoveryEntry.create({
      data: {
        tenantId: tenant.id,
        caseId: demoCase.id,
        amount: 150000,
        method: 'CHARGEBACK',
        description: 'Partial chargeback recovered from the card network.',
        recordedBy: admin.id,
      },
    });

    const writeOffApproval = await tx.approvalRequest.create({
      data: {
        tenantId: tenant.id,
        caseId: demoCase.id,
        action: ApprovalAction.LOSS_WRITE_OFF,
        severityBand: SeverityBand.S1_S2,
        status: ApprovalStatus.APPROVED,
        requestNotes: 'Recovery avenues exhausted — request write-off of the remaining balance.',
        requestedBy: admin.id,
        decisionNotes: 'Approved — write off the remaining ₦300,000.',
        decidedBy: admin.id,
        decidedAt: new Date(),
      },
    });

    await tx.writeOffEntry.create({
      data: {
        tenantId: tenant.id,
        caseId: demoCase.id,
        approvalId: writeOffApproval.id,
        amount: 300000,
        justification: 'Remaining balance approved for write-off; recovery avenues exhausted.',
        recordedBy: admin.id,
      },
    });
  }

  // One demo CAPA thread on the STANDARD case — a root cause analysis, a corrective action taken
  // through its full lifecycle (created -> started -> completed -> validated EFFECTIVE), so the
  // seed data demonstrates the full "root cause, actions, validation" shape, not just the schema
  // existing.
  const existingRootCause = await tx.rootCauseAnalysis.findFirst({ where: { caseId: demoCase.id } });
  if (!existingRootCause) {
    const rootCause = await tx.rootCauseAnalysis.create({
      data: {
        tenantId: tenant.id,
        caseId: demoCase.id,
        version: 1,
        summary: 'Customer had no SIM-swap alert enrolled with the telco, delaying detection of the fraudulent SIM-swap by several hours.',
        analysisMethod: 'FIVE_WHYS',
        identifiedBy: admin.id,
      },
    });

    const capaAction = await tx.capaAction.create({
      data: {
        tenantId: tenant.id,
        caseId: demoCase.id,
        rootCauseId: rootCause.id,
        type: 'PREVENTIVE',
        title: 'Auto-enroll all customers in SIM-swap alerts',
        description: 'Change onboarding flow so every customer is enrolled in real-time SIM-swap alerts by default, not opt-in.',
        ownerId: admin.id,
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        createdBy: admin.id,
      },
    });

    await tx.capaAction.update({
      where: { id: capaAction.id },
      data: { status: 'COMPLETED', completionNotes: 'Onboarding flow updated; auto-enrollment shipped to production.', completedAt: new Date() },
    });

    await tx.capaValidation.create({
      data: {
        tenantId: tenant.id,
        capaActionId: capaAction.id,
        outcome: 'EFFECTIVE',
        notes: 'Confirmed all new accounts opened since the change are auto-enrolled in SIM-swap alerts.',
        validatedBy: admin.id,
      },
    });

    await tx.capaAction.update({ where: { id: capaAction.id }, data: { status: 'VALIDATED' } });
  }

  // One demo regulatory obligation thread on the STANDARD case — an STR/SAR filing obligation
  // (S2 triage severity per CD-02: "Regulatory reporting required within standard statutory
  // window"), taken through its full lifecycle (PENDING -> approved REGULATORY_SUBMISSION ->
  // SUBMITTED -> ACKNOWLEDGED), so the seed data demonstrates the full "obligations register,
  // submissions" shape, not just the schema existing. This is the last module in the MVP build
  // order — every remaining module's seed data now lives on this one case.
  const existingObligation = await tx.regulatoryObligation.findFirst({ where: { caseId: demoCase.id } });
  if (!existingObligation) {
    const obligation = await tx.regulatoryObligation.create({
      data: {
        tenantId: tenant.id,
        caseId: demoCase.id,
        obligationType: 'STR_SAR_FILING',
        description: 'SIM-swap-enabled card fraud, ₦450,000 — file a Suspicious Transaction Report with the NFIU.',
        regulatorName: 'NFIU',
        deadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        identifiedBy: admin.id,
      },
    });

    const submissionApproval = await tx.approvalRequest.create({
      data: {
        tenantId: tenant.id,
        caseId: demoCase.id,
        action: ApprovalAction.REGULATORY_SUBMISSION,
        severityBand: SeverityBand.S1_S2,
        status: ApprovalStatus.APPROVED,
        requestNotes: 'STR ready for filing — request sign-off to submit.',
        requestedBy: admin.id,
        decisionNotes: 'Approved — file the STR with the NFIU.',
        decidedBy: admin.id,
        decidedAt: new Date(),
      },
    });

    await tx.regulatorySubmission.create({
      data: {
        tenantId: tenant.id,
        obligationId: obligation.id,
        approvalId: submissionApproval.id,
        referenceNumber: 'NFIU-STR-2026-004471',
        notes: 'Filed via the NFIU goAML portal.',
        submittedBy: admin.id,
      },
    });
    await tx.regulatoryObligation.update({ where: { id: obligation.id }, data: { status: 'SUBMITTED' } });

    await tx.regulatoryObligation.update({
      where: { id: obligation.id },
      data: { status: 'ACKNOWLEDGED', acknowledgedRef: 'NFIU-ACK-889214', acknowledgedAt: new Date() },
    });
  }

  console.log('Seeded 2 demo signals/incidents (1 STANDARD, 1 WHISTLEBLOWER).');
  console.log('Seeded 1 demo triage assessment (S2, 24x7) on the STANDARD incident — the WHISTLEBLOWER one is left un-triaged.');
  console.log('Seeded 1 demo case (CASE-2026-0001) linked to the STANDARD incident — the WHISTLEBLOWER incident is left un-linked.');
  console.log('Seeded 1 demo SLA clock (STOPPED) and 1 approved CASE_CLOSURE request — CASE-2026-0001 is now CLOSED.');
  console.log('Seeded 1 demo investigation plan, 1 resolved issue, 1 interview, and 1 finding on CASE-2026-0001.');
  console.log('Seeded 1 demo evidence item (hashed, 3 custody events: COLLECTED/VIEWED/HASH_VERIFIED) on CASE-2026-0001.');
  console.log('Seeded 1 approved CONTAINMENT request and 1 CONFIRMED containment action (BLOCK_CARD) on CASE-2026-0001.');
  console.log('Seeded 1 loss entry (₦450,000), 1 recovery entry (₦150,000), and 1 approved write-off (₦300,000) on CASE-2026-0001 — outstanding: ₦0.');
  console.log('Seeded 1 root cause analysis and 1 CAPA action (VALIDATED, EFFECTIVE) on CASE-2026-0001.');
  console.log('Seeded 1 regulatory obligation (STR/SAR filing, ACKNOWLEDGED) on CASE-2026-0001.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
