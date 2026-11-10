import { Pool } from 'pg';
import { createTestApp, TestApp } from '../helpers/app';
import { bootstrapTenant, TestTenant } from '../helpers/fixtures';

/** Append-only grants (non-negotiable #3), hash-chain integrity on fresh data, and the specific
 * `canonicalize()`/`Date` regression this project hit live once already (docs/CHANGELOG.md's
 * 2026-09-30 entry) — re-exercised here as a committed test instead of only a one-off manual
 * check, so it can never silently regress again. */
describe('Audit ledger integrity (non-negotiable #3)', () => {
  let testApp: TestApp;
  let tenant: TestTenant;

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  beforeAll(async () => {
    testApp = await createTestApp();
    tenant = await bootstrapTenant(testApp.http, 'e2e-audit', 'E2E Audit Tenant');
  }, 400000);

  afterAll(async () => {
    await testApp.close();
  });

  it('efims_app cannot UPDATE an audit_events row, even directly over SQL, bypassing the application entirely', async () => {
    // A write first, so there's a real row to attempt to mutate.
    await testApp.http.post('/auth/logout').set(auth(tenant.admin1.accessToken)).send({ refreshToken: tenant.admin1.refreshToken });

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const client = await pool.connect();
      try {
        await client.query(`SELECT set_config('app.current_tenant', $1, false)`, [tenant.tenantId]);
        const { rows } = await client.query('SELECT id FROM audit_events LIMIT 1');
        expect(rows.length).toBeGreaterThan(0);

        await expect(
          client.query('UPDATE audit_events SET outcome = $1 WHERE id = $2', ['FAILURE', rows[0].id]),
        ).rejects.toThrow(/permission denied/i);

        await expect(client.query('DELETE FROM audit_events WHERE id = $1', [rows[0].id])).rejects.toThrow(/permission denied/i);
      } finally {
        client.release();
      }
    } finally {
      await pool.end();
    }
  });

  it('verifyChain reports an intact chain over a real tenant\'s worth of activity', async () => {
    // Generate a handful more events beyond setup (a login + a denied role check).
    await testApp.http.post('/auth/login').send({ tenantSlug: tenant.slug, email: tenant.admin1.email, password: tenant.admin1.password });

    const res = await testApp.http.get('/audit-events/verify').set(auth(tenant.admin1.accessToken));
    expect(res.status).toBe(200);
    expect(res.body.intact).toBe(true);
    expect(res.body.breaks).toEqual([]);
    expect(res.body.eventsChecked).toBeGreaterThan(0);
  });

  it('canonicalize() regression: ratifying a configuration version (which puts a live Date into audit metadata) never breaks the hash chain', async () => {
    // This is the exact code path (configuration.ratify) that previously hashed a live JS Date as
    // the empty object `{}` at write time — see docs/CHANGELOG.md's 2026-09-30 entry for the full
    // incident writeup this test guards against regressing.
    const ratifyRes = await testApp.http
      .post('/configuration/CD_01_INCIDENT_TAXONOMY/1/ratify')
      .set(auth(tenant.admin1.accessToken))
      .send({});
    expect(ratifyRes.status).toBe(201);

    const verifyRes = await testApp.http.get('/audit-events/verify').set(auth(tenant.admin1.accessToken));
    expect(verifyRes.body.intact).toBe(true);
    expect(verifyRes.body.breaks).toEqual([]);
  });

  it('concurrent audit-writing requests never fork or break the hash chain', async () => {
    // Fire several denied-role-check requests (and therefore several concurrent AuditService
    // .record() calls against the same tenant) at once.
    const attempts = Array.from({ length: 8 }, () =>
      testApp.http
        .post(`/configuration/CD_01_INCIDENT_TAXONOMY`)
        .set(auth(tenant.admin1.accessToken))
        .send({ value: { categories: [] }, notes: `concurrent write ${Math.random()}` }),
    );
    await Promise.all(attempts);

    const verifyRes = await testApp.http.get('/audit-events/verify').set(auth(tenant.admin1.accessToken));
    expect(verifyRes.body.intact).toBe(true);
    expect(verifyRes.body.breaks).toEqual([]);
  });
});
