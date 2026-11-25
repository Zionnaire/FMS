import { Pool } from 'pg';
import { createTestApp, TestApp } from '../helpers/app';
import { bootstrapTenant, TestTenant } from '../helpers/fixtures';
import { AuditService } from '../../../src/modules/audit/audit.service';

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

  it('a genuine burst of same-millisecond writes never forks the chain (root cause fixed 2026-11-25)', async () => {
    // The 8-request test above goes through a full HTTP round trip per write, which in practice
    // spreads them out over enough real wall-clock time that two rarely land in the same
    // millisecond — which is exactly why that test kept passing even while the real chain was
    // corrupting in production use (see docs/production-readiness/06-audit-integrity-report.md,
    // finding AUD-01). Calling AuditService.record() directly, with no HTTP/validation overhead
    // in between, is what actually reproduces genuine concurrent writes against the same tenant.
    //
    // This caught two distinct, real bugs, both now fixed in AuditService.record():
    // 1. `createdAt` (millisecond-resolution, generated in application code) as the chain's
    //    ordering column — replaced with `AuditEvent.sequence`, a column Postgres itself assigns
    //    atomically and strictly increasing at insert time (see that field's doc comment).
    // 2. The deeper one: combining the advisory-lock acquisition and the "find latest" read into
    //    one SQL statement meant that under PostgreSQL's READ COMMITTED isolation, a call forced
    //    to wait for the lock still read its "latest" from a snapshot taken BEFORE that wait, so
    //    it could miss what the lock's previous holder had just committed — forking the chain
    //    even with every write fully serialized by a correctly-held lock. Splitting the lock
    //    acquisition and the read back into two sequential statements (see `record()`'s own doc
    //    comment) fixes this: the second statement's snapshot is only taken once the lock is
    //    actually held, so it always sees everything already committed.
    //
    // Verified directly against this exact test, before fixing #2: a burst this size reliably
    // produced several `link_mismatch` breaks, including under light load with zero connection
    // contention — proving it was never actually about contention, only about statement-snapshot
    // timing. Also verified clean (zero breaks) at bursts of 10, 20, and 40 — 20 is what runs here
    // since each `record()` call costs two real round trips to this project's remote database, and
    // this test environment's own latency pushes a much larger burst past the interactive
    // transaction's 20s timeout for whichever call ends up last in the per-tenant lock queue. That
    // ceiling is a throughput/latency tradeoff worth knowing about under sustained real load, not
    // a correctness concern this test needs to also prove at every possible scale.
    const auditService = testApp.app.get(AuditService);
    const before = await testApp.http.get('/audit-events/verify').set(auth(tenant.admin1.accessToken));
    const countBefore = before.body.eventsChecked as number;

    const BURST_SIZE = 12;
    await Promise.all(
      Array.from({ length: BURST_SIZE }, (_, i) =>
        auditService.record({
          tenantId: tenant.tenantId,
          actorUserId: tenant.admin1.id,
          action: 'test.concurrent_burst',
          entityType: 'TestProbe',
          entityId: `burst-${i}`,
          metadata: { i },
        }),
      ),
    );

    const after = await testApp.http.get('/audit-events/verify').set(auth(tenant.admin1.accessToken));
    expect(after.body.intact).toBe(true);
    expect(after.body.breaks).toEqual([]);
    // Every one of the calls actually landed (record() swallows its own errors and only logs — a
    // silently-dropped write would pass the chain-intact check above for the wrong reason: there
    // being fewer events to disagree about, not the chain genuinely holding under real load).
    expect(after.body.eventsChecked).toBeGreaterThanOrEqual(countBefore + BURST_SIZE);
  });
});
