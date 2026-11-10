import { createTestApp, TestApp } from '../helpers/app';
import { bootstrapTenant, createAndLoginUser, TestTenant, TestUser } from '../helpers/fixtures';

/** Non-negotiable #8: EFIMS never shows a case as "contained" until a positive `ActionConfirmed`
 * comes back. A `ContainmentRequest` can only ever reach `CONFIRMED` through an explicit,
 * authenticated `.../confirm` call — never automatically, never as a side effect of requesting
 * or approving it. */
describe('Containment confirmation gate (non-negotiable #8)', () => {
  let testApp: TestApp;
  let tenant: TestTenant;
  let admin2: TestUser;
  let caseId: string;
  let approvalId: string;

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  beforeAll(async () => {
    testApp = await createTestApp();
    tenant = await bootstrapTenant(testApp.http, 'e2e-containment', 'E2E Containment Tenant');
    admin2 = await createAndLoginUser(testApp.http, tenant.slug, tenant.admin1.accessToken, {
      email: 'admin2@e2e-containment.e2e.test',
      fullName: 'E2E Second Admin',
      role: 'ADMIN',
      clearanceLevel: 4,
    });

    const caseRes = await testApp.http
      .post('/cases')
      .set(auth(tenant.admin1.accessToken))
      .send({ title: 'Containment gate fixture case', description: 'Containment gate fixture case description', sensitivityLevel: 1 });
    caseId = caseRes.body.id;

    const approvalRes = await testApp.http
      .post(`/cases/${caseId}/approvals`)
      .set(auth(tenant.admin1.accessToken))
      .send({ action: 'CONTAINMENT', severityBand: 'S3_S4', requestNotes: 'Containment gate fixture approval' });
    const decideRes = await testApp.http
      .post(`/cases/${caseId}/approvals/${approvalRes.body.id}/decide`)
      .set(auth(admin2.accessToken))
      .send({ approved: true });
    approvalId = decideRes.body.id;
  }, 400000);

  afterAll(async () => {
    await testApp.close();
  });

  it('a freshly created containment request starts as REQUESTED, never CONFIRMED', async () => {
    const res = await testApp.http
      .post(`/cases/${caseId}/containment-requests`)
      .set(auth(tenant.admin1.accessToken))
      .send({ approvalId, actionType: 'FREEZE_ACCOUNT', targetDescription: 'Fixture account', rationale: 'Fixture rationale for freeze' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('REQUESTED');
    expect(res.body.confirmedAt).toBeNull();
  });

  it('confirming the request is the only path to CONFIRMED, and requires an explicit confirmationRef', async () => {
    const createRes = await testApp.http
      .post(`/cases/${caseId}/containment-requests`)
      .set(auth(tenant.admin1.accessToken))
      .send({ approvalId: (await requestFreshApproval()).id, actionType: 'BLOCK_CARD', targetDescription: 'Fixture card', rationale: 'Fixture rationale for card block' });
    const requestId = createRes.body.id;

    const confirmRes = await testApp.http
      .post(`/cases/${caseId}/containment-requests/${requestId}/confirm`)
      .set(auth(tenant.admin1.accessToken))
      .send({ confirmationRef: 'E2E-CONF-REF-001' });

    expect(confirmRes.status).toBe(201);
    expect(confirmRes.body.status).toBe('CONFIRMED');
    expect(confirmRes.body.confirmationRef).toBe('E2E-CONF-REF-001');
    expect(confirmRes.body.confirmedAt).not.toBeNull();
  });

  it('an already-confirmed request cannot be confirmed again (no double-confirmation)', async () => {
    const createRes = await testApp.http
      .post(`/cases/${caseId}/containment-requests`)
      .set(auth(tenant.admin1.accessToken))
      .send({ approvalId: (await requestFreshApproval()).id, actionType: 'SUSPEND_ACCESS', targetDescription: 'Fixture access', rationale: 'Fixture rationale for suspend' });
    const requestId = createRes.body.id;

    await testApp.http
      .post(`/cases/${caseId}/containment-requests/${requestId}/confirm`)
      .set(auth(tenant.admin1.accessToken))
      .send({ confirmationRef: 'FIRST-CONFIRM' });

    const secondConfirm = await testApp.http
      .post(`/cases/${caseId}/containment-requests/${requestId}/confirm`)
      .set(auth(tenant.admin1.accessToken))
      .send({ confirmationRef: 'SECOND-CONFIRM-SHOULD-FAIL' });

    expect(secondConfirm.status).toBe(400);
  });

  it('a rejected request can never later become CONFIRMED', async () => {
    const createRes = await testApp.http
      .post(`/cases/${caseId}/containment-requests`)
      .set(auth(tenant.admin1.accessToken))
      .send({ approvalId: (await requestFreshApproval()).id, actionType: 'HOLD_TRANSACTION', targetDescription: 'Fixture transaction', rationale: 'Fixture rationale for hold' });
    const requestId = createRes.body.id;

    const rejectRes = await testApp.http
      .post(`/cases/${caseId}/containment-requests/${requestId}/reject`)
      .set(auth(tenant.admin1.accessToken))
      .send({ reason: 'Source system declined the request' });
    expect(rejectRes.body.status).toBe('REJECTED');

    const confirmAfterReject = await testApp.http
      .post(`/cases/${caseId}/containment-requests/${requestId}/confirm`)
      .set(auth(tenant.admin1.accessToken))
      .send({ confirmationRef: 'SHOULD-NOT-WORK' });
    expect(confirmAfterReject.status).toBe(400);

    const getRes = await testApp.http.get(`/cases/${caseId}/containment-requests/${requestId}`).set(auth(tenant.admin1.accessToken));
    expect(getRes.body.status).toBe('REJECTED');
  });

  it('a containment request can never be created without first referencing an APPROVED CONTAINMENT approval', async () => {
    const res = await testApp.http
      .post(`/cases/${caseId}/containment-requests`)
      .set(auth(tenant.admin1.accessToken))
      .send({ approvalId: '00000000-0000-0000-0000-000000000000', actionType: 'FREEZE_ACCOUNT', targetDescription: 'No approval', rationale: 'Should be rejected for missing approval' });
    expect(res.status).toBe(400);
  });

  /** One approval authorizes exactly one containment request (schema's own `@unique` on
   * `approvalId`) — each sub-test here needs its own fresh approved approval. */
  async function requestFreshApproval(): Promise<{ id: string }> {
    const reqRes = await testApp.http
      .post(`/cases/${caseId}/approvals`)
      .set(auth(tenant.admin1.accessToken))
      .send({ action: 'CONTAINMENT', severityBand: 'S3_S4', requestNotes: 'Fresh fixture approval' });
    const decideRes = await testApp.http
      .post(`/cases/${caseId}/approvals/${reqRes.body.id}/decide`)
      .set(auth(admin2.accessToken))
      .send({ approved: true });
    return { id: decideRes.body.id };
  }
});
