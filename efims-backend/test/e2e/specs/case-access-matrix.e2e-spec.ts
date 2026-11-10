import { createTestApp, TestApp } from '../helpers/app';
import { bootstrapTenant, createAndLoginUser, TestTenant, TestUser } from '../helpers/fixtures';

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

    const caseRes = await testApp.http
      .post('/cases')
      .set(auth(tenant.admin1.accessToken))
      .send({
        title: 'Case access matrix fixture case',
        description: 'Used to exercise every one of the 7 access conditions independently',
        sensitivityLevel: 2,
        compartment: 'AML_MLRO',
      });
    caseId = caseRes.body.id;
    await testApp.http
      .post(`/cases/${caseId}/team`)
      .set(auth(tenant.admin1.accessToken))
      .send({ teamId });

    async function makeUser(email: string, clearanceLevel: number, compartments: string[], onTeam: boolean): Promise<TestUser> {
      const user = await createAndLoginUser(testApp.http, tenant.slug, tenant.admin1.accessToken, {
        email,
        fullName: email,
        role: 'INVESTIGATOR',
        clearanceLevel,
        compartments,
      });
      if (onTeam) {
        await testApp.http
          .post(`/teams/${teamId}/members`)
          .set(auth(tenant.admin1.accessToken))
          .send({ userId: user.id });
      }
      return user;
    }

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

    await testApp.http
      .post(`/cases/${caseId}/flags`)
      .set(auth(tenant.admin1.accessToken))
      .send({ userId: subjectUser.id, type: 'SUBJECT', reason: 'fixture' });
    await testApp.http
      .post(`/cases/${caseId}/flags`)
      .set(auth(tenant.admin1.accessToken))
      .send({ userId: conflictUser.id, type: 'CONFLICT', reason: 'fixture' });
  }, 400000);

  afterAll(async () => {
    await testApp.close();
  });

  async function expectDeniedAndAudited(token: string, expectedReason: string) {
    const res = await testApp.http.get(`/cases/${caseId}`).set(auth(token));
    expect(res.status).toBe(403);

    const auditRes = await testApp.http
      .get('/audit-events')
      .query({ entityId: caseId, action: 'cases.case.view', outcome: 'DENIED' })
      .set(auth(tenant.admin1.accessToken));
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
