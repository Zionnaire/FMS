import { createTestApp, TestApp } from '../helpers/app';
import { bootstrapTenant, TestTenant } from '../helpers/fixtures';

/** CD-08 Phase 2's guardrail, enforced architecturally (non-negotiable #4): ml-gateway's
 * suggestion endpoints are read-only and advisory — they must never write a `TriageAssessment`
 * themselves, and must degrade to a clean 503 (not a crash, not a silent fallback to some other
 * behavior) when no real Groq key is configured. `test/e2e/.env.test` deliberately uses the same
 * placeholder `GROQ_API_KEY` value `.env.example` ships with, so this suite always exercises the
 * unconfigured path — never makes a real external call to Groq. */
describe('ml-gateway advisory boundary (CD-08 Phase 2 / non-negotiable #4)', () => {
  let testApp: TestApp;
  let tenant: TestTenant;
  let incidentId: string;

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  beforeAll(async () => {
    testApp = await createTestApp();
    tenant = await bootstrapTenant(testApp.http, 'e2e-ai-boundary', 'E2E AI Boundary Tenant');

    const signalRes = await testApp.http
      .post('/signals')
      .set(auth(tenant.admin1.accessToken))
      .send({ source: 'MANUAL_ENTRY', summary: 'AI boundary fixture signal' });
    const incidentRes = await testApp.http
      .post(`/signals/${signalRes.body.id}/validate`)
      .set(auth(tenant.admin1.accessToken))
      .send({ category: 'Fraud', type: 'Card fraud', title: 'AI boundary fixture incident', description: 'AI boundary fixture incident description' });
    // POST /signals/:id/validate returns { updated: Signal, incidentId, resultingStatus } — not
    // the Incident itself. See fixtures.ts's seedFullLifecycle for the full writeup of this exact
    // historical bug (docs/CHANGELOG.md's 2026-09-26 entry), reproduced and fixed here too.
    incidentId = incidentRes.body.incidentId;

    // A second, same-category incident so the similarity endpoint has a real candidate to score
    // — with zero candidates, IncidentsService.findSimilarIncidents short-circuits to `[]` before
    // ever reaching ml-gateway/Groq at all, which would make this suite's 503 assertion vacuous
    // (passing for the wrong reason: "no candidates" looks identical to "AI unavailable" unless a
    // real candidate forces the code path that actually calls ml-gateway).
    const secondSignalRes = await testApp.http
      .post('/signals')
      .set(auth(tenant.admin1.accessToken))
      .send({ source: 'MANUAL_ENTRY', summary: 'AI boundary fixture second signal' });
    await testApp.http
      .post(`/signals/${secondSignalRes.body.id}/validate`)
      .set(auth(tenant.admin1.accessToken))
      .send({ category: 'Fraud', type: 'Card fraud', title: 'AI boundary fixture candidate incident', description: 'A real candidate for the similarity scan' });
  }, 400000);

  afterAll(async () => {
    await testApp.close();
  });

  it('severity suggestion degrades to a clean 503 when Groq is unconfigured, never a 500 crash', async () => {
    const res = await testApp.http.get(`/incidents/${incidentId}/triage/suggestion`).set(auth(tenant.admin1.accessToken));
    expect(res.status).toBe(503);
  });

  it('a severity suggestion request never creates a TriageAssessment row, regardless of outcome', async () => {
    const before = await testApp.http.get(`/incidents/${incidentId}/triage`).set(auth(tenant.admin1.accessToken));
    const countBefore = before.body.length;

    await testApp.http.get(`/incidents/${incidentId}/triage/suggestion`).set(auth(tenant.admin1.accessToken));

    const after = await testApp.http.get(`/incidents/${incidentId}/triage`).set(auth(tenant.admin1.accessToken));
    expect(after.body.length).toBe(countBefore);
  });

  it('similarity detection also degrades to a clean 503 when Groq is unconfigured', async () => {
    const res = await testApp.http.get(`/incidents/${incidentId}/similar`).set(auth(tenant.admin1.accessToken));
    expect(res.status).toBe(503);
  });

  it('a similarity request never mutates the incident or creates any relation, regardless of outcome', async () => {
    const before = await testApp.http.get(`/incidents/${incidentId}`).set(auth(tenant.admin1.accessToken));

    await testApp.http.get(`/incidents/${incidentId}/similar`).set(auth(tenant.admin1.accessToken));

    const after = await testApp.http.get(`/incidents/${incidentId}`).set(auth(tenant.admin1.accessToken));
    expect(after.body.status).toBe(before.body.status);
    expect(after.body.updatedAt).toBe(before.body.updatedAt);
  });
});
