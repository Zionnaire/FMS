/**
 * Manual verification for the Socket.IO gateway + notifications' full round trip — NOT part of
 * `npm test` (jest), deliberately: this needs a running app (`npm run start`/`start:dev`)
 * against a real, seeded database, which a unit test suite shouldn't depend on.
 *
 * Run with the app already up: `node test/manual/realtime-notifications.manual.js`
 *
 * What it proves, end to end: admin requests a CASE_CLOSURE approval on the seeded STANDARD
 * case -> the authorized decider (a FRAUD_RISK_MANAGER test user) receives an
 * `approval.requested` push live over their own websocket connection, with no page reload/poll
 * -> that user rejects it -> admin (the original requester) receives an `approval.decided` push
 * live on theirs. This is the exact flow this project's own live-verification pass used to prove
 * `RealtimeService`/`NotificationsService` actually work, not just compile — see
 * docs/CHANGELOG.md's cross-cutting-infrastructure entry.
 *
 * Not idempotent across repeated runs: creating the FRAUD_RISK_MANAGER test user 409s on a
 * second run (harmless, ignored), but each run creates a fresh `ApprovalRequest` — expected,
 * since `approval_requests` has no DELETE grant by design (see rls-policies.sql). Re-running
 * this script a lot will accumulate rejected test approvals on the seeded case; that's the same
 * accepted tradeoff already documented for this project's append-only-by-design tables.
 */
const { io } = require('socket.io-client');

const BASE = process.env.EFIMS_BASE_URL || 'http://localhost:3001';

async function login(email, password) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantSlug: 'bank-1', email, password }),
  });
  return res.json();
}

async function main() {
  const admin = await login('admin@bank1.efims.local', 'ChangeMe123!');
  if (!admin.accessToken) {
    throw new Error(`Admin login failed — is the app running at ${BASE} against the seeded database? Response: ${JSON.stringify(admin)}`);
  }

  await fetch(`${BASE}/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.accessToken}` },
    body: JSON.stringify({
      email: 'realtime-test-frm@bank1.efims.local',
      fullName: 'Realtime Test FRM',
      role: 'FRAUD_RISK_MANAGER',
      clearanceLevel: 4,
      temporaryPassword: 'RealtimeTest123!',
    }),
  });

  const frm = await login('realtime-test-frm@bank1.efims.local', 'RealtimeTest123!');

  const adminSocket = io(`${BASE}/realtime`, { auth: { token: admin.accessToken }, transports: ['websocket'] });
  const frmSocket = io(`${BASE}/realtime`, { auth: { token: frm.accessToken }, transports: ['websocket'] });

  const received = { frm: null, admin: null };
  frmSocket.on('notification.created', (payload) => (received.frm = payload));
  adminSocket.on('notification.created', (payload) => (received.admin = payload));

  await Promise.all([
    new Promise((resolve, reject) => {
      adminSocket.on('connect', resolve);
      adminSocket.on('connect_error', reject);
    }),
    new Promise((resolve, reject) => {
      frmSocket.on('connect', resolve);
      frmSocket.on('connect_error', reject);
    }),
  ]);
  console.log('Both sockets connected.');

  const casesResp = await fetch(`${BASE}/cases`, { headers: { Authorization: `Bearer ${admin.accessToken}` } }).then((r) => r.json());
  // STANDARD compartment — visible to a fresh test user with no compartment grants.
  const targetCase = casesResp.cases.find((c) => c.referenceCode === 'CASE-2026-0001') || casesResp.cases[0];
  console.log('Using case:', targetCase.referenceCode);

  const approvalResp = await fetch(`${BASE}/cases/${targetCase.id}/approvals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.accessToken}` },
    body: JSON.stringify({ action: 'CASE_CLOSURE', severityBand: 'S1_S2', requestNotes: 'Realtime push manual test — admin requests, FRM should be notified live.' }),
  }).then((r) => r.json());
  console.log('Approval requested:', approvalResp.id);

  await new Promise((r) => setTimeout(r, 1500));
  console.log('FRM received (approval.requested):', received.frm ? received.frm.type : 'NOTHING');

  const decideResp = await fetch(`${BASE}/cases/${targetCase.id}/approvals/${approvalResp.id}/decide`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${frm.accessToken}` },
    body: JSON.stringify({ approved: false, decisionNotes: 'Rejecting — this is just a realtime-push manual test.' }),
  }).then((r) => r.json());
  console.log('Approval decided:', decideResp.status);

  await new Promise((r) => setTimeout(r, 1500));
  console.log('Admin received (approval.decided):', received.admin ? received.admin.type : 'NOTHING');

  adminSocket.disconnect();
  frmSocket.disconnect();

  const ok = Boolean(received.frm && received.admin);
  console.log(ok ? 'PASS' : 'FAIL');
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
