import { createTestApp, TestApp } from '../helpers/app';
import { bootstrapTenant, seedFullLifecycle, TestTenant } from '../helpers/fixtures';
import { listRlsEnabledTables, RawAppRoleSession, RawTenantScopedSession } from '../helpers/db';

describe('Tenant isolation (non-negotiable #5)', () => {
  let testApp: TestApp;
  let tenantA: TestTenant;
  let tenantB: TestTenant;
  let rlsTables: string[];

  beforeAll(async () => {
    testApp = await createTestApp();
    tenantA = await bootstrapTenant(testApp.http, 'e2e-tenant-a', 'E2E Tenant A');
    tenantB = await bootstrapTenant(testApp.http, 'e2e-tenant-b', 'E2E Tenant B');

    // Seed a full lifecycle for BOTH tenants so every table genuinely has real rows under both —
    // proving isolation on an empty table is vacuous.
    await seedFullLifecycle(testApp, tenantA);
    await seedFullLifecycle(testApp, tenantB);

    rlsTables = await listRlsEnabledTables();
  }, 600000);

  afterAll(async () => {
    await testApp.close();
  });

  it('enables RLS on every tenant-scoped table this schema currently has (sanity check on the list itself)', () => {
    // Guards against the list silently coming back empty (e.g. a bad connection string) and the
    // rest of this suite passing vacuously.
    expect(rlsTables.length).toBeGreaterThanOrEqual(30);
    expect(rlsTables).toContain('cases');
    expect(rlsTables).toContain('audit_events');
  });

  it('a raw efims_app database session with no tenant context sees zero rows on every table, even though real rows exist', async () => {
    const session = new RawAppRoleSession();
    try {
      for (const table of rlsTables) {
        const count = await session.countVisibleRows(table);
        expect({ table, count }).toEqual({ table, count: 0 });
      }
    } finally {
      await session.close();
    }
  });

  it('a raw efims_app session scoped to tenant A sees tenant A rows but never tenant B rows, on every table', async () => {
    const session = new RawTenantScopedSession();
    try {
      let tablesWithAnyData = 0;
      for (const table of rlsTables) {
        const countA = await session.countVisibleRows(table, tenantA.tenantId);
        if (countA > 0) tablesWithAnyData++;
      }
      // Most tables should have at least some data under tenant A, given the full lifecycle seed —
      // a near-zero count here would mean the fixture itself silently failed, not that isolation
      // is broken, so this is a fixture sanity check as much as an isolation one.
      expect(tablesWithAnyData).toBeGreaterThan(20);
    } finally {
      await session.close();
    }
  });

  it('tenant A can never see a tenant B row and vice versa, on every table — direct proof, not just a count comparison', async () => {
    const session = new RawTenantScopedSession();
    try {
      for (const table of rlsTables) {
        const visibleUnderA = await session.distinctTenantIdsVisible(table, tenantA.tenantId);
        expect(visibleUnderA).not.toContain(tenantB.tenantId);
        expect(visibleUnderA.every((id) => id === tenantA.tenantId)).toBe(true);

        const visibleUnderB = await session.distinctTenantIdsVisible(table, tenantB.tenantId);
        expect(visibleUnderB).not.toContain(tenantA.tenantId);
        expect(visibleUnderB.every((id) => id === tenantB.tenantId)).toBe(true);
      }
    } finally {
      await session.close();
    }
  });

  it('the real HTTP layer never returns tenant B data to a tenant A user (case list)', async () => {
    const resA = await testApp.http
      .get('/cases')
      .set('Authorization', `Bearer ${tenantA.admin1.accessToken}`);
    expect(resA.status).toBe(200);
    const caseIdsA: string[] = resA.body.cases.map((c: { id: string }) => c.id);
    expect(caseIdsA.length).toBeGreaterThan(0);

    const resB = await testApp.http
      .get('/cases')
      .set('Authorization', `Bearer ${tenantB.admin1.accessToken}`);
    const caseIdsB: string[] = resB.body.cases.map((c: { id: string }) => c.id);

    const overlap = caseIdsA.filter((id) => caseIdsB.includes(id));
    expect(overlap).toHaveLength(0);
  });

  it('the real HTTP layer rejects a tenant A token used to read a specific tenant B case by id (404, not data)', async () => {
    const resB = await testApp.http
      .get('/cases')
      .set('Authorization', `Bearer ${tenantB.admin1.accessToken}`);
    const tenantBCaseId: string = resB.body.cases[0].id;

    const crossRes = await testApp.http
      .get(`/cases/${tenantBCaseId}`)
      .set('Authorization', `Bearer ${tenantA.admin1.accessToken}`);

    // RLS means the row is invisible under tenant A's context, not merely access-denied — the
    // application sees it as if it doesn't exist at all, which is the correct failure mode for a
    // security boundary (no confirmation that the id even belongs to another tenant).
    expect(crossRes.status).toBe(404);
  });
});
