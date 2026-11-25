import { PrismaClient } from '@prisma/client';
import type { TestApp } from './app';
import { provisionTenant } from '../../../src/platform/tenant-provisioning';

export interface TestUser {
  id: string;
  email: string;
  password: string;
  role: string;
  accessToken: string;
  refreshToken: string;
}

export interface TestTenant {
  tenantId: string;
  slug: string;
  /** The tenant's first admin, seeded by `provisionTenant` itself. Previously held a standing,
   * ungated grant to every compartment; that was removed from provisioning on 2026-11-24 (see
   * `tenant-provisioning.ts`) — `ADMIN` itself was never a code-level compartment bypass, just a
   * grant written at provisioning time. `admin1` is now STANDARD-only like any freshly-created
   * user, same as production; a fixture needing a protected compartment must request or grant one
   * explicitly, same as a real tenant would. */
  admin1: TestUser;
}

const DEFAULT_PASSWORD = 'Test-Password-123!';

/** Thin wrapper around the same `provisionTenant` the real platform-admin tenant-provisioning
 * flow and `prisma/seed.ts` both use — never a second hand-rolled bootstrap, so a test tenant is
 * provisioned exactly the way a real one would be. Uses a `PrismaClient` connected as `efims_app`
 * (the exact role/grants the running application itself uses), not the privileged owner role —
 * proof that provisioning genuinely works within the app's own real database permissions. */
export async function bootstrapTenant(http: TestApp['http'], slug: string, name: string): Promise<TestTenant> {
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  try {
    const { tenantId, adminUserId } = await provisionTenant(prisma, {
      slug,
      name,
      adminEmail: `admin@${slug}.e2e.test`,
      adminFullName: 'E2E Admin',
      adminPassword: DEFAULT_PASSWORD,
    });

    const admin1 = await loginAs(http, slug, `admin@${slug}.e2e.test`, DEFAULT_PASSWORD);
    if (admin1.id !== adminUserId) {
      throw new Error('Fixture bug: logged-in admin id does not match provisioned admin id');
    }

    return { tenantId, slug, admin1 };
  } finally {
    await prisma.$disconnect();
  }
}

export async function loginAs(http: TestApp['http'], tenantSlug: string, email: string, password: string): Promise<TestUser> {
  const res = await http.post('/auth/login').send({ tenantSlug, email, password });
  if (res.status !== 201 && res.status !== 200) {
    throw new Error(`Login failed for ${email}@${tenantSlug}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return {
    id: res.body.user.id,
    email,
    password,
    role: res.body.user.role,
    accessToken: res.body.accessToken,
    refreshToken: res.body.refreshToken,
  };
}

/** Creates a second user via the real `POST /users` endpoint (admin-only) and logs in as them —
 * exercising the real user-creation path rather than inserting a row directly, since this is
 * cheap enough (one HTTP round trip) not to need a raw-insert shortcut. */
export async function createAndLoginUser(
  http: TestApp['http'],
  tenantSlug: string,
  adminToken: string,
  opts: { email: string; fullName: string; role: string; clearanceLevel: number; compartments?: string[] },
): Promise<TestUser> {
  const createRes = await http
    .post('/users')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      email: opts.email,
      fullName: opts.fullName,
      role: opts.role,
      clearanceLevel: opts.clearanceLevel,
      compartments: opts.compartments ?? ['STANDARD'],
      temporaryPassword: DEFAULT_PASSWORD,
    });
  if (createRes.status !== 201) {
    throw new Error(`User creation failed for ${opts.email}: ${createRes.status} ${JSON.stringify(createRes.body)}`);
  }
  return loginAs(http, tenantSlug, opts.email, DEFAULT_PASSWORD);
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/** Every fixture HTTP call goes through this — silently continuing past a failed setup call
 * (e.g. a 400 from a DTO mismatch) with `undefined` ids cascading through the rest of the chain
 * is worse than a loud failure: it produces confusing, seemingly-unrelated errors several steps
 * later instead of pointing at the actual broken call. `status` defaults to 2xx; pass an explicit
 * expected status for calls that aren't a plain create/fetch. */
export async function expectStatus<T extends { status: number; body: unknown }>(resPromise: Promise<T>, label: string, expected?: number): Promise<T> {
  const res = await resPromise;
  const ok = expected !== undefined ? res.status === expected : res.status >= 200 && res.status < 300;
  if (!ok) {
    throw new Error(`Fixture step failed — ${label}: expected ${expected ?? '2xx'}, got ${res.status}. Body: ${JSON.stringify(res.body)}`);
  }
  return res;
}

/** One full signal -> incident -> case -> every-downstream-module walk, mirroring this project's
 * own established manual Playwright verification pattern (see docs/CHANGELOG.md's many
 * "full-verify.js" entries) but as a reusable, committed fixture. Touches as many of the 33
 * tenant-scoped tables as a realistic single walk-through reasonably can — see
 * test/e2e/README.md for which tables this does and doesn't reach. Every step uses the real HTTP
 * API with the real role gates, not a shortcut — a bug in any of these modules would surface here
 * exactly as it would in production traffic. */
export async function seedFullLifecycle(testApp: TestApp, tenant: TestTenant) {
  const { http } = testApp;
  const { slug, admin1 } = tenant;

  const investigator = await createAndLoginUser(http, slug, admin1.accessToken, {
    email: `investigator@${slug}.e2e.test`,
    fullName: 'E2E Investigator',
    role: 'INVESTIGATOR',
    clearanceLevel: 2,
    compartments: ['STANDARD'],
  });
  const admin2 = await createAndLoginUser(http, slug, admin1.accessToken, {
    email: `admin2@${slug}.e2e.test`,
    fullName: 'E2E Second Admin',
    role: 'ADMIN',
    clearanceLevel: 4,
  });

  // --- signals / whistleblower vault / incidents / incident_relations ---
  const signal = (
    await expectStatus(
      http.post('/signals').set(auth(admin1.accessToken)).send({ source: 'MANUAL_ENTRY', summary: 'E2E fixture signal — card fraud report' }),
      'create signal',
      201,
    )
  ).body;

  const whistleblowerSignal = (
    await expectStatus(
      http
        .post('/signals')
        .set(auth(admin1.accessToken))
        .send({ source: 'WHISTLEBLOWER', summary: 'E2E fixture whistleblower report', isAnonymous: false, reporterName: 'E2E Reporter' }),
      'create whistleblower signal',
      201,
    )
  ).body;

  // POST /signals/:id/validate returns { updated: Signal, incidentId, resultingStatus } — NOT
  // the Incident itself. This is the exact historical bug documented in docs/CHANGELOG.md's
  // 2026-09-26 frontend entry ("mistyped the response as Incident ... redirected using the
  // signal's own id"); reproduced here once in this fixture and now fixed the same way: read
  // `.incidentId`, never `.id`, off this response.
  const incidentValidation = (
    await expectStatus(
      http
        .post(`/signals/${signal.id}/validate`)
        .set(auth(admin1.accessToken))
        .send({ category: 'Fraud', type: 'Card fraud', title: 'E2E fixture incident', description: 'E2E fixture incident description' }),
      'validate signal into incident',
      201,
    )
  ).body;
  const incidentId: string = incidentValidation.incidentId;

  const secondIncidentValidation = (
    await expectStatus(
      http
        .post(`/signals/${whistleblowerSignal.id}/validate`)
        .set(auth(admin1.accessToken))
        .send({ category: 'Whistleblowing', type: 'Whistleblower report', title: 'E2E fixture second incident', description: 'For incident_relations coverage' }),
      'validate whistleblower signal into second incident',
      201,
    )
  ).body;
  const secondIncidentId: string = secondIncidentValidation.incidentId;

  // `relate` runs the same compartment-visibility check `getById` would on BOTH incidents
  // (incidents.service.ts's `relate` calls `getById` on `id` and `relatedIncidentId` in turn), and
  // `secondIncidentId` above is forced into the WHISTLEBLOWING compartment (it was validated from
  // a WHISTLEBLOWER-source signal — see SignalsService.validate's `forcedCompartment`). `admin1`
  // no longer carries a standing blanket compartment grant (removed from provisioning 2026-11-24 —
  // see tenant-provisioning.ts and TestTenant's own doc comment above), so it can no longer
  // perform this call itself; found live running the full suite post-AUD-03. A narrowly-granted
  // reviewer, scoped to exactly the compartment this one call needs, is the actually-correct actor
  // for linking a whistleblower-sourced incident anyway — not a workaround.
  const whistleblowingReviewer = await createAndLoginUser(http, slug, admin1.accessToken, {
    email: `whistleblowing-reviewer@${slug}.e2e.test`,
    fullName: 'E2E Whistleblowing Reviewer',
    role: 'COMPLIANCE_MLRO',
    clearanceLevel: 4,
    compartments: ['STANDARD', 'WHISTLEBLOWING'],
  });
  await expectStatus(
    http.post(`/incidents/${incidentId}/relate`).set(auth(whistleblowingReviewer.accessToken)).send({ relatedIncidentId: secondIncidentId }),
    'relate incidents',
    201,
  );

  // --- triage_assessments / sla_clocks ---
  await expectStatus(
    http
      .post(`/incidents/${incidentId}/triage`)
      .set(auth(admin1.accessToken))
      .send({ severity: 'S3', slaCalendarName: 'business_hours', rationale: 'E2E fixture triage rationale' }),
    'triage assessment',
    201,
  );

  const slaClock = (
    await expectStatus(
      http
        .post(`/incidents/${incidentId}/sla-clock`)
        .set(auth(admin1.accessToken))
        .send({ targetDeadline: new Date(Date.now() + 4 * 3600 * 1000).toISOString() }),
      'start SLA clock',
      201,
    )
  ).body;

  // --- cases / case_user_flags / case_status_history ---
  const theCase = (
    await expectStatus(
      http
        .post('/cases')
        .set(auth(admin1.accessToken))
        .send({ title: 'E2E fixture case', description: 'E2E fixture case description', sensitivityLevel: 1, incidentIds: [incidentId] }),
      'create case',
      201,
    )
  ).body;

  await expectStatus(
    http
      .post(`/cases/${theCase.id}/flags`)
      .set(auth(admin1.accessToken))
      .send({ userId: investigator.id, type: 'CONFLICT', reason: 'E2E fixture conflict flag' }),
    'add case flag',
    201,
  );

  await expectStatus(
    http.post(`/cases/${theCase.id}/status`).set(auth(admin1.accessToken)).send({ status: 'UNDER_INVESTIGATION', reason: 'E2E fixture status change' }),
    'update case status',
    201,
  );

  // --- approval_requests (x3, one per CD-04 action this fixture exercises) ---
  async function requestAndApprove(action: string): Promise<string> {
    const approval = (
      await expectStatus(
        http
          .post(`/cases/${theCase.id}/approvals`)
          .set(auth(admin1.accessToken))
          .send({ action, severityBand: 'S3_S4', requestNotes: `E2E fixture ${action} approval request` }),
        `request ${action} approval`,
        201,
      )
    ).body;
    const decided = (
      await expectStatus(
        http
          .post(`/cases/${theCase.id}/approvals/${approval.id}/decide`)
          .set(auth(admin2.accessToken))
          .send({ approved: true, decisionNotes: 'E2E fixture approval' }),
        `decide ${action} approval`,
        201,
      )
    ).body;
    return decided.id;
  }
  const containmentApprovalId = await requestAndApprove('CONTAINMENT');
  const writeOffApprovalId = await requestAndApprove('LOSS_WRITE_OFF');
  const regulatoryApprovalId = await requestAndApprove('REGULATORY_SUBMISSION');

  // --- containment_requests ---
  const containmentRequest = (
    await expectStatus(
      http
        .post(`/cases/${theCase.id}/containment-requests`)
        .set(auth(admin1.accessToken))
        .send({ approvalId: containmentApprovalId, actionType: 'FREEZE_ACCOUNT', targetDescription: 'E2E fixture account', rationale: 'E2E fixture containment rationale' }),
      'create containment request',
      201,
    )
  ).body;

  await expectStatus(
    http
      .post(`/cases/${theCase.id}/containment-requests/${containmentRequest.id}/confirm`)
      .set(auth(admin1.accessToken))
      .send({ confirmationRef: 'E2E-FIXTURE-CONF-001' }),
    'confirm containment request',
    201,
  );

  // --- investigation_plans / investigation_issues / interviews / findings ---
  await expectStatus(
    http.post(`/cases/${theCase.id}/investigation-plans`).set(auth(admin1.accessToken)).send({ objectives: 'E2E fixture objectives', scope: 'E2E fixture scope' }),
    'create investigation plan',
    201,
  );

  const issue = (
    await expectStatus(
      http.post(`/cases/${theCase.id}/issues`).set(auth(admin1.accessToken)).send({ title: 'E2E fixture issue', description: 'E2E fixture issue description' }),
      'create issue',
      201,
    )
  ).body;

  await expectStatus(
    http.post(`/cases/${theCase.id}/issues/${issue.id}/resolve`).set(auth(admin1.accessToken)).send({ resolution: 'E2E fixture resolution' }),
    'resolve issue',
    201,
  );

  await expectStatus(
    http
      .post(`/cases/${theCase.id}/interviews`)
      .set(auth(admin1.accessToken))
      .send({ intervieweeName: 'E2E Interviewee', intervieweeRole: 'WITNESS', conductedAt: new Date().toISOString(), summary: 'E2E fixture interview summary' }),
    'create interview',
    201,
  );

  await expectStatus(
    http
      .post(`/cases/${theCase.id}/findings`)
      .set(auth(admin1.accessToken))
      .send({ title: 'E2E fixture finding', description: 'E2E fixture finding description', resolvesIssueId: issue.id }),
    'create finding',
    201,
  );

  // --- evidence_items / custody_events ---
  const evidence = (
    await expectStatus(
      http
        .post(`/cases/${theCase.id}/evidence`)
        .set(auth(admin1.accessToken))
        .send({ category: 'DOCUMENT', title: 'E2E fixture evidence', content: 'e2e-fixture-content-for-hash' }),
      'ingest evidence',
      201,
    )
  ).body;

  await expectStatus(
    http.post(`/cases/${theCase.id}/evidence/${evidence.id}/custody`).set(auth(admin1.accessToken)).send({ action: 'VIEWED', notes: 'E2E fixture custody event' }),
    'record custody event',
    201,
  );

  // --- loss_entries / recovery_entries / write_off_entries ---
  await expectStatus(
    http.post(`/cases/${theCase.id}/recovery/losses`).set(auth(admin1.accessToken)).send({ amount: 50000, category: 'PRINCIPAL', description: 'E2E fixture loss' }),
    'record loss',
    201,
  );

  await expectStatus(
    http.post(`/cases/${theCase.id}/recovery/recoveries`).set(auth(admin1.accessToken)).send({ amount: 10000, method: 'CHARGEBACK', description: 'E2E fixture recovery' }),
    'record recovery',
    201,
  );

  await expectStatus(
    http
      .post(`/cases/${theCase.id}/recovery/write-offs`)
      .set(auth(admin1.accessToken))
      .send({ approvalId: writeOffApprovalId, amount: 5000, justification: 'E2E fixture write-off justification' }),
    'record write-off',
    201,
  );

  // --- root_cause_analyses / capa_actions / capa_validations ---
  await expectStatus(
    http.post(`/cases/${theCase.id}/root-causes`).set(auth(admin1.accessToken)).send({ summary: 'E2E fixture root cause summary' }),
    'create root cause',
    201,
  );

  const capaAction = (
    await expectStatus(
      http
        .post(`/cases/${theCase.id}/capa-actions`)
        .set(auth(admin1.accessToken))
        .send({
          type: 'CORRECTIVE',
          title: 'E2E fixture CAPA action',
          description: 'E2E fixture CAPA description',
          ownerId: investigator.id,
          dueDate: new Date(Date.now() + 30 * 86400 * 1000).toISOString(),
        }),
      'create CAPA action',
      201,
    )
  ).body;

  await expectStatus(http.post(`/cases/${theCase.id}/capa-actions/${capaAction.id}/start`).set(auth(admin1.accessToken)).send({}), 'start CAPA action', 201);
  await expectStatus(
    http.post(`/cases/${theCase.id}/capa-actions/${capaAction.id}/complete`).set(auth(admin1.accessToken)).send({ completionNotes: 'E2E fixture completion notes' }),
    'complete CAPA action',
    201,
  );
  // Validator must differ from the action's own owner (investigator) — admin2 validates.
  await expectStatus(
    http
      .post(`/cases/${theCase.id}/capa-actions/${capaAction.id}/validate`)
      .set(auth(admin2.accessToken))
      .send({ outcome: 'EFFECTIVE', notes: 'E2E fixture validation notes' }),
    'validate CAPA action',
    201,
  );

  // --- regulatory_obligations / regulatory_submissions ---
  const obligation = (
    await expectStatus(
      http
        .post(`/cases/${theCase.id}/regulatory-obligations`)
        .set(auth(admin1.accessToken))
        .send({ obligationType: 'STR_SAR_FILING', description: 'E2E fixture obligation', deadline: new Date(Date.now() + 10 * 86400 * 1000).toISOString() }),
      'create regulatory obligation',
      201,
    )
  ).body;

  await expectStatus(
    http
      .post(`/cases/${theCase.id}/regulatory-obligations/${obligation.id}/submit`)
      .set(auth(admin1.accessToken))
      .send({ approvalId: regulatoryApprovalId, referenceNumber: 'E2E-FIXTURE-REF-001' }),
    'submit regulatory obligation',
    201,
  );

  // --- access_change_requests ---
  const accessChange = (
    await expectStatus(
      http
        .post(`/users/${investigator.id}/access-changes`)
        .set(auth(admin1.accessToken))
        .send({ changeType: 'GRANT_COMPARTMENT', compartment: 'AML_MLRO', requestNotes: 'E2E fixture access change request' }),
      'request access change',
      201,
    )
  ).body;

  await expectStatus(
    http
      .post(`/access-change-requests/${accessChange.id}/decide`)
      .set(auth(admin2.accessToken))
      .send({ approved: true, decisionNotes: 'E2E fixture access change decision' }),
    'decide access change',
    201,
  );

  return {
    investigator,
    admin2,
    signal,
    whistleblowerSignal,
    incidentId,
    secondIncidentId,
    slaClock,
    case: theCase,
    containmentApprovalId,
    writeOffApprovalId,
    regulatoryApprovalId,
    containmentRequest,
    evidence,
    capaAction,
    obligation,
    accessChange,
  };
}
