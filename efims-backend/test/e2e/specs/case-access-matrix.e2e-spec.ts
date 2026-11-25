import { createTestApp, TestApp } from '../helpers/app';
import { bootstrapTenant, createAndLoginUser, expectStatus, TestTenant, TestUser } from '../helpers/fixtures';

/** The full 7-condition case-access rule (CLAUDE.md non-negotiable #6 / architecture.md §4.3):
 * tenant match, role permission, team match (or elevated role), user not a subject/conflict,
 * clearance >= sensitivity, compartment authorized. Each condition is proven to fail
 * independently (with its audit event), plus the all-pass case succeeds. */
describe('Case access matrix (non-negotiable #6)', () => {
  let testApp: TestApp;
  let tenant: TestTenant;
  let otherTenant: TestTenant;
  let teamId: string;
  let caseId: string;

  let caseAdmin: TestUser;
  let memberInScope: TestUser;
  let notOnTeam: TestUser;
  let subjectUser: TestUser;
  let conflictUser: TestUser;
  let lowClearanceUser: TestUser;
  let noCompartmentUser: TestUser;
  let wrongRoleUser: TestUser;

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  beforeAll(async () => {
    testApp = await createTestApp();
    tenant = await bootstrapTenant(testApp.http, 'e2e-case-matrix', 'E2E Case Matrix Tenant');
    otherTenant = await bootstrapTenant(testApp.http, 'e2e-case-matrix-other', 'E2E Other Tenant');

    const teamsRes = await testApp.http.get('/teams').set(auth(tenant.admin1.accessToken));
    teamId = teamsRes.body[0].id;

    const caseRes = await expectStatus(
      testApp.http
        .post('/cases')
        .set(auth(tenant.admin1.accessToken))
        .send({
          title: 'Case access matrix fixture case',
          description: 'Used to exercise every one of the 7 access conditions independently',
          sensitivityLevel: 2,
          compartment: 'AML_MLRO',
        }),
      'create the AML_MLRO fixture case',
      201,
    );
    caseId = caseRes.body.id;

    async function makeUser(email: string, clearanceLevel: number, compartments: string[], onTeam: boolean, role = 'INVESTIGATOR'): Promise<TestUser> {
      const user = await createAndLoginUser(testApp.http, tenant.slug, tenant.admin1.accessToken, {
        email,
        fullName: email,
        role,
        clearanceLevel,
        compartments,
      });
      if (onTeam) {
        await expectStatus(
          testApp.http.post(`/teams/${teamId}/members`).set(auth(tenant.admin1.accessToken)).send({ userId: user.id }),
          `add ${email} to the team`,
        );
      }
      return user;
    }

    // Team assignment and subject/conflict flagging both run through the case's own full
    // 7-condition access check (CasesService.assignTeam/addFlag each call getById first, same
    // gate as viewing the case) — so whoever performs this fixture's own setup needs real,
    // granted access to this case's AML_MLRO compartment, same as any real case administrator
    // would. `tenant.admin1` no longer has a standing grant to every compartment (fixed
    // 2026-11-25 — see docs/production-readiness/01-current-state-assessment.md), so using it
    // here would 403 on both calls below and silently leave the case half-configured: that's
    // exactly what this fixture used to do, masked only because neither call checked its own
    // response status. `expectStatus` on every setup call now makes that failure loud instead.
    caseAdmin = await makeUser('case-admin@e2e-case-matrix.e2e.test', 4, ['AML_MLRO'], true, 'TEAM_LEAD');

    memberInScope = await makeUser('member-in-scope@e2e-case-matrix.e2e.test', 4, ['AML_MLRO'], true);
    notOnTeam = await makeUser('not-on-team@e2e-case-matrix.e2e.test', 4, ['AML_MLRO'], false);
    subjectUser = await makeUser('subject@e2e-case-matrix.e2e.test', 4, ['AML_MLRO'], true);
    conflictUser = await makeUser('conflict@e2e-case-matrix.e2e.test', 4, ['AML_MLRO'], true);
    lowClearanceUser = await makeUser('low-clearance@e2e-case-matrix.e2e.test', 1, ['AML_MLRO'], true);
    noCompartmentUser = await makeUser('no-compartment@e2e-case-matrix.e2e.test', 4, ['STANDARD'], true);
    wrongRoleUser = await createAndLoginUser(testApp.http, tenant.slug, tenant.admin1.accessToken, {
      email: 'wrong-role@e2e-case-matrix.e2e.test',
      fullName: 'Wrong Role User',
      role: 'INCIDENT_REPORTER',
      clearanceLevel: 4,
      compartments: ['AML_MLRO'],
    });

    await expectStatus(
      testApp.http.post(`/cases/${caseId}/team`).set(auth(caseAdmin.accessToken)).send({ teamId }),
      'assign the fixture case to the team',
    );
    await expectStatus(
      testApp.http.post(`/cases/${caseId}/flags`).set(auth(caseAdmin.accessToken)).send({ userId: subjectUser.id, type: 'SUBJECT', reason: 'fixture' }),
      'flag subjectUser as SUBJECT',
      201,
    );
    await expectStatus(
      testApp.http.post(`/cases/${caseId}/flags`).set(auth(caseAdmin.accessToken)).send({ userId: conflictUser.id, type: 'CONFLICT', reason: 'fixture' }),
      'flag conflictUser as CONFLICT',
      201,
    );
  }, 400000);

  afterAll(async () => {
    await testApp.close();
  });

  async function expectDeniedAndAudited(token: string, expectedReason: string) {
    const res = await testApp.http.get(`/cases/${caseId}`).set(auth(token));
    expect(res.status).toBe(403);

    // AUD-03 (2026-11-25): `GET /audit-events` now compartment-filters its results the same way
    // `CasesService` filters case visibility — a reader with no AML_MLRO grant correctly no longer
    // sees DENIED events for an AML_MLRO case, confirming it's in a protected compartment at all.
    // `tenant.admin1` has no standing compartment grant since this same date's admin-provisioning
    // fix (see `tenant-provisioning.ts`), so it can no longer be used here — `caseAdmin` is granted
    // AML_MLRO and is in `AUDIT_READ_ROLES` (`TEAM_LEAD`), the same real-world shape a genuine case
    // administrator reviewing their own case's audit trail would have.
    const auditRes = await testApp.http
      .get('/audit-events')
      .query({ entityId: caseId, action: 'cases.case.view', outcome: 'DENIED' })
      .set(auth(caseAdmin.accessToken));
    expect(auditRes.status).toBe(200);
    const matching = auditRes.body.events.filter((e: { metadata: { reason?: string } }) => e.metadata?.reason === expectedReason);
    expect(matching.length).toBeGreaterThan(0);
  }

  it('condition 1 — tenant: a user from a different tenant gets 404, not 403 (RLS makes the row invisible, not merely forbidden)', async () => {
    const res = await testApp.http.get(`/cases/${caseId}`).set(auth(otherTenant.admin1.accessToken));
    expect(res.status).toBe(404);
  });

  it('condition 2 — role permission: a role outside CASE_ROLES is rejected by the route guard before any case-level check runs', async () => {
    const res = await testApp.http
      .post('/cases')
      .set(auth(wrongRoleUser.accessToken))
      .send({ title: 'Should never be created', description: 'Blocked by role guard', sensitivityLevel: 1 });
    expect(res.status).toBe(403);

    const auditRes = await testApp.http
      .get('/audit-events')
      .query({ action: 'authz.role_check', outcome: 'DENIED', actorUserId: wrongRoleUser.id })
      .set(auth(tenant.admin1.accessToken));
    expect(auditRes.body.events.length).toBeGreaterThan(0);
  });

  it('condition 3 — team: a non-elevated user not on the assigned team is denied, audited "not_on_assigned_team"', async () => {
    await expectDeniedAndAudited(notOnTeam.accessToken, 'not_on_assigned_team');
  });

  it('condition 4 — not a subject: a user flagged SUBJECT on this case is denied, audited "user_is_subject"', async () => {
    await expectDeniedAndAudited(subjectUser.accessToken, 'user_is_subject');
  });

  it('condition 5 — no conflict: a user flagged CONFLICT on this case is denied, audited "user_has_conflict"', async () => {
    await expectDeniedAndAudited(conflictUser.accessToken, 'user_has_conflict');
  });

  it('condition 6 — clearance: a user whose clearance is below the case sensitivity is denied, audited "insufficient_clearance"', async () => {
    await expectDeniedAndAudited(lowClearanceUser.accessToken, 'insufficient_clearance');
  });

  it('condition 7 — compartment: a user without the case\'s compartment granted is denied, audited "compartment_not_authorized"', async () => {
    await expectDeniedAndAudited(noCompartmentUser.accessToken, 'compartment_not_authorized');
  });

  it('all seven conditions passing: an in-scope, unflagged, sufficiently-cleared, correctly-compartmented team member can view the case', async () => {
    const res = await testApp.http.get(`/cases/${caseId}`).set(auth(memberInScope.accessToken));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(caseId);
  });
});
