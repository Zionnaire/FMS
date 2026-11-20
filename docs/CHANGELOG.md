# EFIMS — Build Changelog

Running log of decisions and changes made during the build. Add a dated entry every time a
doc in this folder is revised, a module ships, or an architectural/config decision changes.
Newest entries at the top.

---

## 2026-11-19 (cont'd, 7th pass) — Production incident: Render backend crash-looping, fixed (`otplib` → `speakeasy`)

The deployed Render backend was crash-looping at boot, every restart cycle, locking everyone out
of the live system:

```
Error [ERR_REQUIRE_ESM]: require() of ES Module .../node_modules/@scure/base/index.js from
.../node_modules/@otplib/plugin-base32-scure/dist/index.cjs not supported.
```

**Root cause**: `otplib` (added earlier this session for the MFA feature) transitively depends on
`@otplib/plugin-base32-scure` → `@scure/base`, which is genuinely ESM-only (`"type": "module"`,
no CJS build at all — confirmed by reading its `package.json` directly). otplib ships only one
base32 plugin, so there was no CJS-safe alternative already in its own dependency tree. This is a
different failure mode than the earlier `web-push` ESM crash this session already fixed: that one
was *our own* import statement and could be hidden from `tsc` with a dynamic `import()`. This one
is inside a third-party package's own precompiled `.cjs`, invisible to `tsc`/`nest build` and to
local `nest start --watch` alike — it only surfaces when the actual compiled production artifact
(`dist/main.js`) boots under plain `node`, which is exactly the Render startCommand
(`npx prisma migrate deploy && npm run start`) and exactly what local dev never exercises.

**Fix**: replaced `otplib` with `speakeasy` (`^2.0.0`) — a mature, pure-CommonJS TOTP/HOTP
library (RFC 6238/4226) with zero ESM anywhere in its dependency tree (confirmed via its and its
one dependency `base32.js`'s own `package.json`, and zero known security advisories). Rewrote all
three MFA call sites in `efims-backend/src/modules/identity/auth.service.ts`
(`startMfaEnrollment`, `confirmMfaEnrollment`, `verifyMfaAndLogin`) to speakeasy's API
(`generateSecret`/`otpauthURL`/`totp.verify`, secrets stored/compared as base32 throughout).
User-facing MFA behavior is unchanged — same enroll/QR/confirm/backup-code/disable flow, same
~±30s clock-drift tolerance (`window: 1` replaces otplib's `epochTolerance: 30`).

**Verified, not just asserted**: clean `tsc --noEmit`/lint/`nest build`; then the actual
reproduction step that would have caught this before it ever reached Render — booted the
compiled `dist/main.js` directly with plain `node` and confirmed it starts cleanly through full
module init and route mapping with no `ERR_REQUIRE_ESM`. Then ran the full MFA flow live against
the real Neon database end to end: login → enroll → confirm with a real generated TOTP code →
status check → re-login correctly challenged → verify with a fresh TOTP code → a wrong code
correctly rejected (401) → a backup code correctly accepted and consumed → disable → re-login no
longer requires MFA. All 10 steps passed.

**Not yet done**: this fix is committed to the working tree but deploying it to Render requires a
push to the tracked branch, which wasn't done as part of this fix — flag to the user before
assuming the live outage is resolved.

---

## 2026-11-19 (cont'd, 6th pass) — Two niche items: real team-conflict check, honest system health

Fourth and fifth items off the stakeholder-gap list: team-assignment conflict check, and a real
system-health view. Checked both closest-named mockups first, same discipline as every item
before this one. Both were almost entirely fabricated: `team-assignment-conflict-check.html`
modeled PEP/beneficial-ownership screening against a fictional "CBN LexisNexis Bridger Insight"
and a fake hardware-token/dual-custody-key table; `system-health-telemetry.html` modeled a
14-node Kubernetes cluster with named fake microservices (`efims-auth-enclave`,
`mule-detection-heuristics`, ...), a fake HSM, a fake Istio service mesh, and fake CPU/RAM/IOPS
metrics — directly contradicting this project's own documented modular-monolith architecture.
Each mockup had exactly one real, honestly-buildable thing underneath the theater, and that's
what got built.

**Team-assignment conflict check**: new `GET /cases/:id/team-conflict-check?teamId=X` —
before actually assigning a team to a case, checks whether any of its members already carry a
`SUBJECT`/`CONFLICT` flag on that case (non-negotiable #6) and surfaces who, by name, with their
flag type and reason. Purely advisory, never blocks the assignment — the real access control
(denying that specific member regardless of team assignment) was already correct and unchanged;
this just tells the assigner *before* they assign, instead of only at the moment someone tries
to open the case and gets denied. Wired into the case overview's existing team-reassignment
form, which now fires the check live as a candidate team is picked.

**Real bug found and fixed, pre-existing, not introduced by this change**: the team-reassignment
`<Select>` was never controlled, so picking a *different* team made the trigger fall back to
showing the raw team UUID instead of its name — nothing before this had ever exercised
re-selecting a team through that control. Fixed by controlling it properly.

**System health**: new `/settings/system-health` page (CONFIG_ROLES-gated, alongside
Integrations/Retention) — API/database reachability (`GET /health/ready`, a genuine `SELECT 1`,
not just the DB-independent liveness check), audit hash-chain integrity (`GET /audit-events/
verify`), CD-01..08 ratification count, and real user/team counts. Every number on this page is
something the app can actually produce — no fabricated infrastructure, no invented metrics.

**Found a real, separate issue while live-verifying this page**: `GET /audit-events/verify` has
no pagination — it fetches every audit event for the tenant and recomputes a hash for each one
in memory — and took over 30 seconds against this session's own accumulated test-data volume,
risking a timeout for any caller, not just this new page (which degrades gracefully when that
happens, showing "unable to verify right now" instead of crashing — confirmed live). The
existing Audit page's own verify button would hit the identical slowdown. Flagged in
`docs/OPEN_ITEMS.md` as a real fix needed later (paginate, or verify incrementally from a
last-known-good checkpoint) — not fixed now, out of scope for this pass.

Live-verified both features in a real browser end to end, including catching and correcting a
test-harness false alarm along the way (an earlier verification attempt flagged the admin test
account's *own* user id as a case conflict, which correctly — per non-negotiable #6, already
documented as "correct, not a bug" elsewhere in this project's history — locked that same account
out of viewing the case; re-ran with a different real team member once recognized). `tsc
--noEmit`, lint, and `next build`/`nest build` clean on both apps.

Closed both corresponding `docs/OPEN_ITEMS.md` lines. Next and last: network graph / entity risk
scoring / customer 360 — the one item that genuinely needs new domain models, deserving its own
design pass rather than being folded into this same quick sequence.

---

## 2026-11-19 (cont'd, 5th pass) — Keep-alive workflow: real login failures traced to free-tier cold starts

User hit a real, live failure on the deployed Render instance: login returned "Unable to reach
EFIMS Core right now. Try again shortly," and asked whether to migrate off Neon entirely. Rather
than agreeing or pushing back reflexively, explained the actual mechanism first — this matches
P1001/connection-pool flakiness hit repeatedly, live, throughout this project's own build
sessions this week, and is a free-tier serverless *compute-suspend* behavior (Neon's free
Postgres suspends after a short idle window, Render's free web services separately spin down
after ~15 min idle), not a Neon-specific defect. Migrating providers without also paying for a
non-free tier elsewhere likely just trades one cold-start profile for another, and a real
migration (new connection strings, re-running every migration + RLS policy, re-seeding,
re-verifying the whole app) is a nontrivial, risky undertaking — laid out the real options
(keep-alive ping / upgrade off free tier / migrate providers) and let the user choose. They chose
the keep-alive ping.

**Built**: `.github/workflows/keep-alive.yml` — pings the backend's `GET /health/ready` (a real
`SELECT 1` against Postgres, confirmed live keeps Neon's compute warm, not just the `GET /health`
liveness check which deliberately never touches the database) and the frontend's `GET
/api/health`, every 5 minutes, 24/7. Free: this repository is public, so GitHub Actions minutes
aren't metered. Confirmed live that both inferred URLs
(`https://efims-backend.onrender.com`, `https://efims-frontend.onrender.com`) actually resolve
and return healthy before committing to them in the workflow, rather than guessing. Updated
`docs/deployment.md`'s existing "before a live demo" section to describe this as the primary
mitigation now, with manual pre-warming / upgrading off the free tier kept as fallbacks for if
the workflow is ever disabled.

## 2026-11-19 (cont'd, 4th pass) — Real structured STR/SAR and regulator-notification filing capture

Third item off the stakeholder-gap list: bespoke STR/CBN regulatory filing generators (the
`/regulatory` page was a real, generic obligation tracker, not a structured filing tool). Checked
both closest-named mockups (`str-form-generator.html`, `cbn-incident-report.html`) before
building. Verdict, same honesty discipline as MFA and the Outcomes tab:

- **The CBN mockup was almost entirely unbuildable as a template** — nearly every field is static
  read-only text, not a real input, and its action buttons ("Transmit Filing," "Cryptographically
  Sign & Transmit") imply real transmission to CBN's actual portal plus HSM-based cryptographic
  signing (fake "YubiHSM Key #8812," "FIPS 140-3 Level 4," a fake CBN gateway IP) and biometric
  SMS-OTP dual sign-off — none of which exist or should be fabricated. (When the user asked why
  these specifically weren't buildable: regulator transmission isn't buildable as *real* because
  there's no public API/credential set for NFIU's goAML or CBN's BSD-CR-01 portal that this
  project could call — not an effort problem, a "nothing real to call" problem. Basic software
  signing and SMS OTP are technically buildable in the abstract, just not as the specific
  fabricated hardware/compliance claims the mockups make, and not scoped into this pass.)
- **The STR mockup had real, usable structure underneath the fabricated goAML-submission theater**:
  reporting institution, subjects of report, a grounds-of-suspicion narrative, and a transaction
  schedule are all genuine STR/SAR fields. Built that part for real, dropped the rest (the
  "Submit to NFIU goAML" button, the fake sign-off chain, fabricated sample data).

**Built**: `RegulatoryObligation` gained a `filingDetails Json?` field (migration
`20261119203934_regulatory_filing_details`, applied to dev and the e2e test DB) — shape depends
on `obligationType`, same pattern `AccessChangeRequest.payload` already uses. `STR_SAR_FILING`
gets the four real sections above (subjects and transactions as repeatable rows — EFIMS has no
customer/account/transaction entity to pick these from, so they're honestly hand-entered, not
auto-populated from fake linked data); `REGULATOR_NOTIFICATION` gets a lighter shape (institution,
incident classification, narrative, financial exposure). New `PATCH .../filing-details` endpoint,
only while the obligation is still `PENDING` — once submitted, what was actually filed is a fact
of record, not something anyone revises after. The grounds-of-suspicion/narrative field seeds
from the case's own description on first open (real EFIMS data), never overwriting an existing
draft. A new standalone `/regulatory-preview/[caseId]/[obligationId]` route — deliberately outside
the app shell (no sidenav/topnav) — renders the filing as a clean document with a **"Print / Save
as PDF"** button, not a "Submit"/"Transmit" button: nothing in this codebase sends this anywhere:
a human prints or saves it and files it through whatever real channel the regulator provides, same
honest line this project already draws for containment (non-negotiable #8 — request and wait,
never act) and evidence (hash + pointer, never the file itself).

**Real bug found and fixed during live verification, then one false alarm corrected**: calling
`revalidatePath` after a filing-details save forced an immediate full Server Component refetch
that could render ahead of the write's own read-after-write consistency, which is unnecessary for
a draft an analyst may save many times while still editing — removed it, and added a "Preview
filing" link driven by the form's own local state instead, so the preview is reachable immediately
without a page reload. (The *false alarm*: this looked at first like saved data vanishing from the
form, but it wasn't — a debug text dump was checked with `.innerText()`, which never includes
`<input>` *values* at all, only surrounding text; direct database inspection confirmed the data
was correctly persisted and pre-filled the entire time. Corrected before writing this up, rather
than reporting a fix for a bug that was never actually there.)

Live-verified twice end to end in a real browser: created an STR obligation, filled in all four
sections (institution, a subject, the auto-seeded grounds-of-suspicion narrative, a transaction),
saved, opened the standalone preview, and confirmed the exact entered values rendered correctly —
zero console errors both times. Testing itself tripped the backend's own overload-protection
filter once (connection-pool pressure from ~20 rapid test-created obligations on one case) —
confirms that resilience feature still works as designed, not a regression. Test obligations
cleaned up afterward (confirmed by case/decision, not unilaterally — per the user's prior approval
pattern for this kind of cleanup this session). `tsc --noEmit`, lint, and `next build`/`nest build`
clean on both apps.

Closed the corresponding `docs/OPEN_ITEMS.md` line. Next up: the smaller niche items (team-
assignment conflict check, a real system-health view) before the one genuinely big remaining
piece — network graph / entity risk scoring / customer 360, which needs real new domain models.

---

## 2026-11-19 (cont'd, 3rd pass) — Outcomes tab: the incidents→cases→recovery→CAPA business story

Second item off the stakeholder-gap list: "a unified business-value dashboard tying
incidents→cases→recovery→CAPA into one outcomes/ROI story." Checked the closest-named mockup
first (`executive-threat-briefing.html`) before building anything — it turned out to be a
fabricated board-briefing deck, not a real reference: invented "Attack Topography" threat
categories with no basis in CD-01, a fictional "EFIMS Neural Ingress Kernel v4.8" AI brand (this
project's real `ml-gateway` has no such name or capability), and Thales HSM/NIBSS telemetry
claims with no real infrastructure behind them — the same over-the-top theater problem the MFA
mockup had. Built from this project's real data model instead, same discipline as that fix.

**Additive, not a new page**: a third "Outcomes" tab on the existing `ExecutiveDashboard`,
alongside "Operations" (current portfolio state) and "Analytics" (trend charts) — those two
already covered most of the incidents→cases→recovery ground well; the real gaps were CAPA (not
represented anywhere on this dashboard) and an explicit lifecycle view. Shows:

- **Recovery rate** — `totalRecovered / totalLoss`, reusing `CasesService.stats()`'s existing
  cross-case loss/recovery aggregate (no new backend work needed here).
- **Case closure rate + mean days-to-close** — the closure rate also reuses existing data;
  mean-days-to-close is new (`CaseStats.meanDaysToClose`, computed from real `closedAt`/
  `createdAt` over the already-loaded visible case set — `null`, not `0`, when no case is closed
  yet, since those are genuinely different facts).
- **CAPA effectiveness** — % of corrective/preventive actions `COMPLETED` or `VALIDATED`, computed
  from the existing `/capa` register endpoint (`CapaService.listAll`) — no new backend endpoint;
  this is purely new frontend aggregation over data the app already exposes.
- **A lifecycle funnel** (Signals reported → Incidents opened → Cases built → Cases closed) and a
  **CAPA status breakdown** (reusing the existing `SegmentedBar` component, same pattern as the
  severity/incident-status mixes already on the Operations tab).

Live-verified in a real browser as the seeded `EXECUTIVE` user (the only role this dashboard
renders for — `ADMIN` gets its own separate Administration dashboard, confirmed live when the
first verification attempt against `admin@bank1.efims.local` correctly never found this page):
clicked into the new tab, confirmed real computed numbers rendered (an honest, low recovery rate
and closure rate given this is a small, mostly-open seed dataset — not inflated to look better),
zero console errors. `tsc --noEmit`, lint, and `next build`/`nest build` clean on both apps.

Closed the corresponding `docs/OPEN_ITEMS.md` line. Next up: the bespoke STR/CBN regulatory
filing generators.

---

## 2026-11-19 (cont'd, 2nd pass) — Real TOTP MFA shipped, first of the stakeholder-gap feature list

User asked to build out the full stakeholder-gap list from the audit above and left the build
order to this session's own judgment. Started with MFA — self-contained, no new domain models,
and a mockup (`login-mfa.html`) already existed to anchor the design.

**Deliberately dropped the mockup's fabricated enterprise theater** (Thales Luna HSM, YubiKey/
FIDO2 hardware tokens, a CBN anti-fraud telemetry pipeline, "air-gapped compliance enclave") —
none of that infrastructure exists in this system, and the mockup itself names the real, honestly
buildable standard underneath all of it: RFC 6238 (TOTP). Built that, for real:

- **Schema**: `User` gained `mfaEnabled`/`mfaSecret`/`mfaBackupCodeHashes`/`mfaEnrolledAt`
  (migration `20261119135808_user_mfa`, applied to dev and the e2e test DB). Opt-in, never
  forced — every existing and new user stays `mfaEnabled: false` until they go through the
  enroll/confirm flow themselves.
- **Backend** (`AuthService`/`AuthController`, `otplib` + `qrcode`, both added with zero new
  production-path npm-audit findings): `login()` now checks `mfaEnabled` and, if set, returns a
  short-lived (5 min) challenge token signed with a brand-new, separate `JWT_MFA_CHALLENGE_SECRET`
  instead of real tokens — same "different token kinds never share a signing key" discipline as
  the platform layer. `POST /auth/mfa/verify` accepts either a live TOTP code or an unused backup
  code (tries TOTP first, falls back to backup-code hash matching, consumes it on match) and only
  then issues real tokens. Four self-service endpoints (`status`/`enroll/start`/`enroll/confirm`/
  `disable`) act on the caller's own account only — no "admin enrolls someone else" path exists or
  should. `enroll/confirm` returns 10 backup codes in plaintext exactly once; only their sha256
  hashes are ever persisted. `disable` requires re-entering the password, not just a live session.
- **Frontend**: the login form (`login-form.tsx`) now renders a second step when `loginAction`
  gets back `mfaRequired` — a hidden `mfaChallengeToken` field tells the same server action apart
  from a fresh password attempt, no separate route needed. New `/settings/security` page (reachable
  from every role via a new topnav shield icon, not gated to admin roles — a second factor only
  means something if the account holder set it up themselves) walks through QR-code enrollment
  (with a manual-entry fallback), confirms with a real code, shows backup codes once, and lets a
  user disable MFA with their password.
- **Real bug found and fixed during live verification**: `otplib`'s `TOTP.verify()` throws
  (`TokenLengthError`) rather than returning `{valid: false}` for anything that isn't exactly 6
  digits — meaning a backup-code attempt (9 characters, "A1B2-C3D4") crashed the verify endpoint
  with a 500 instead of falling through to backup-code matching. Fixed by only attempting TOTP
  verification when the input matches `/^\d{6}$/`.

**Live-verified twice**: first a full API-level script (login → enroll → confirm → status →
MFA-challenged login → wrong code rejected → right code accepted → backup code accepted →
backup-code reuse correctly rejected → disable → normal login resumes), then a real Playwright
browser session driving the actual UI end to end (login → Security settings → Enable MFA → scan
QR → confirm → backup codes shown → sign out → sign back in → correctly challenged → verify →
disable) — **zero console errors**. `tsc --noEmit`, lint, and `next build`/`nest build` all clean
on both apps.

Added `JWT_MFA_CHALLENGE_SECRET` to `.env.example`, the real `.env`, `test/e2e/.env.test`,
`.github/workflows/ci.yml`, and `render.yaml` (`generateValue: true`, same as the other JWT
secrets). Closed the corresponding `docs/OPEN_ITEMS.md` line.

---

## 2026-11-19 (cont'd) — Four-way production-readiness audit ahead of a stakeholder demo

User asked for a broader look — structure, principle, technical, design/UX, security, and feature
completeness — explicitly framed as "stakeholder demo" readiness, distinct from the much larger
"production for real bank data" bar (CD ratification, legal/NDPA, data residency — still
out of scope, unchanged). Ran four parallel, independent audits (security; UX/design; technical/
architecture; feature-completeness) mirroring the 2026-11-02 three-way audit pattern. Real
findings, fixed same session:

**Security — one real access-control gap, fixed.** The new (2026-11-18) generic
`PATCH /ml-gateway/predictions/:predictionId/decision` endpoint checked tenant + role only, not
the underlying entity's compartment/clearance — unlike every suggestion endpoint that produces
these predictions, which already goes through `IncidentsService.getById`/`CasesService.getById`
first. A non-reporter user in the same tenant could have recorded a decision on a prediction tied
to an incident/case they have no real access to (e.g. a `WHISTLEBLOWING`-compartment incident),
a real gap against non-negotiable #6. `ml-gateway` can't check this itself — `IncidentsModule`
already imports `MlGatewayModule`, and `CasesModule` imports `TriageModule` which also imports it,
so the reverse dependency would be circular. Fixed by splitting the route: `MlGatewayService`
gained a read-only `getPredictionRecord`; `TriageController`/`RecoveryController` each gained
their own entity-scoped `.../suggestion/:predictionId/decision` and `.../predict/:predictionId/
decision` routes that run the real access check before deciding; the generic ml-gateway route now
only accepts `ANOMALY` decisions (the one capability with no EFIMS entity to check), rejecting
anything else with a clear message. Everything else came back clean: no new npm-audit findings
in either app, `ML_SERVICE_API_KEY` never logged/leaked, RLS and tenant isolation still hold live,
auth/role gates return correct 401/403 with no detail leakage.

**Technical/architecture — found the e2e suite's documented status was false, and a real
pre-existing bug nobody had hit.** `docs/OPEN_ITEMS.md` claimed "36 tests, ~65% coverage"; the
suite actually failed to compile at all. Root cause, unrelated to anything from 2026-11-18:
`CasesService.list()`'s `Promise.all([needsTeams ? this.teamsService.list(tx) : [], ...])`
produced ambiguous tuple inference that only ts-jest's stricter config caught — `tsc --noEmit`
on the main build stayed clean throughout, masking it. Fixed with explicit types on the
`Promise.all` destructure and the two `Map` constructions it feeds. Separately found the
dedicated `efims_test` database was missing two real migrations (`push_subscriptions`,
`ml_prediction_records`) — never applied there since they shipped; applied both, re-ran RLS.
Also confirmed, independently: non-negotiables #2/#3/#4/#5 all still hold on every file touched
this week; no dead code or leftover duplication from today's refactors. One pre-existing,
previously-unflagged #2 violation noted for later (not fixed now, out of scope for this pass):
`RecoveryService.predictRecovery` reads `containmentRequest` directly instead of through a
`ContainmentService` method.

**Getting the suite to actually pass surfaced two more real, previously-invisible bugs**, both
fixed:
1. `NotificationsService`'s constructor ran the ESM `dynamicImportWebPush()` dynamic import
   eagerly, the moment the service is instantiated — which crashed instantly under `ts-jest`
   (`A dynamic import callback was invoked without --experimental-vm-modules`), since every one
   of the 6 e2e spec files boots the app regardless of whether it ever sends a push notification.
   Fixed by deferring the import to first actual use (`getWebpushModule()`, called only from
   `sendPush`) instead of the constructor — strictly better even outside testing, since it also
   stops paying this cost for any process lifetime that never sends a push.
2. **A real e2e test-isolation gap, made newly dangerous by the 2026-11-18 integration**:
   `test/e2e/.env.test` never overrode `ML_SERVICE_BASE_URL`/`ML_SERVICE_API_KEY` or the VAPID
   keys, so NestJS's `ConfigModule` fell back to the real `.env` for all of them — meaning e2e
   runs would silently call the *real, live* `https://efims-ai.onrender.com` with the real API
   key instead of hitting the "service unreachable" path `ai-advisory-boundary.e2e-spec.ts`
   assumes, consuming real vendor quota non-deterministically on every test run. Before
   2026-11-18 this was harmless (`.env`'s old default was an unreachable `127.0.0.1:8000`
   placeholder); it became a real problem the moment `.env` started pointing at a real, live
   service. Fixed by pinning `ML_SERVICE_BASE_URL`/`ML_SERVICE_API_KEY`/`VAPID_*` to the same
   safe-unreachable/blank values in `test/e2e/.env.test`, mirrored into `.github/workflows/
   ci.yml`'s matching heredoc so CI (once its test-DB secrets are configured) never inherits the
   same leak.

**Feature-completeness — golden path passes 23/23** (signal → incident → triage/severity-suggest
→ decide → case → approval with segregation-of-duties correctly rejecting self-approval →
investigation → evidence → containment, correctly never faking "contained" → recovery → CAPA →
regulatory → audit), verified at the API level against real data including the live AI service.
Corrected a stale figure: the 2026-11-02 "~27/35 mockups unbuilt" claim is now closer to ~15/33
(~45%) given everything shipped since — real progress worth reflecting honestly rather than
leaving the old, now-too-pessimistic number standing. Ranked list of things a stakeholder is
likely to ask about that genuinely don't exist yet (network graph/entity risk/customer 360, a
unified business-value dashboard tying incidents→cases→recovery→CAPA into one outcomes story,
MFA on login, bespoke STR/CBN regulatory filing generators vs. the current generic obligation
tracker) recorded in `docs/OPEN_ITEMS.md` for the user to prioritize — none built unprompted.

**UX/design — zero console errors anywhere, no demo-blocking bugs.** One concrete, fixed-same-day
item: four leftover test accounts ("Playwright Test Investigator", "Second Test Admin", two "UI
Test Admin" rows) were visible in the live Users directory — exactly what a stakeholder would see
clicking into Administration. Deleted (with the one `AccessChangeRequest` row that referenced one
of them as its target, removed first) after explicit confirmation. Two reminders for whoever runs
the actual demo, not code changes: pre-warm both the backend and the live AI service a few minutes
before (Render free-tier cold starts are real and visible), and demo off a production build
(`next build && next start`), not `next dev` (whose build-activity badge can overlap the sidenav).

Verification: `tsc --noEmit` and lint clean on both apps. Full e2e re-run confirms the fixes:
**5 of 6 suites now pass completely, 30/36 tests** (up from 6/6 suites failing to even compile
before this pass). The one remaining failure, `tenant-isolation.e2e-spec.ts`, is the already-
documented pre-existing Neon/Prisma transaction-timeout flakiness in `OPEN_ITEMS.md` (not
introduced by anything here) — this run added a concrete diagnostic clue (`CasesService.
findOrThrow` hitting a closed-transaction error during the heavy two-tenant bootstrap fixture)
recorded there for whoever eventually root-causes it.

---

## 2026-11-19 — Decide UI extended to all three ml-gateway panels; Next.js patched

Two follow-ups from the 2026-11-18 entry below, both closed same-day:

1. **Next.js security advisory.** The frontend build had started printing a Next.js-native
   security nudge (separate from `npm audit`, which never flagged it — this check hits
   `registry.npmjs.org/-/npm/v1/security/advisories/bulk` directly at build time). Investigated
   rather than ignored: two moderate advisories (GHSA-mfr8-8qww-v76h, GHSA-vc7v-qv4w-wrv8,
   CWE-362) affecting `'use cache'`/`unstable_cache()` root-param cache leaks, versions
   `16.2.0–16.4.4`. Confirmed not exploitable here regardless — this codebase never uses either
   API, and `backend-client.ts` already sets `cache: 'no-store'` on every request — but `16.4.6`
   was already published with a fix, so upgraded (`16.4.3` → `16.4.6`) rather than leave a real,
   named CVE sitting open ahead of a stakeholder demo. Clean rebuild, no nudge on the next build.
2. **Decide UI was severity-only.** Extracted the "Accepted / Went a different way" controls
   from `SeveritySuggestionPanel` into a shared `components/shell/prediction-decision-controls.tsx`
   and wired it into the other two advisory panels that were missing it:
   `RecoveryPredictionPanel` (always has a real `predictionId` — no Groq-fallback path exists for
   recovery) and `TransactionRiskScoringForm` (same, for anomaly scoring). `tsc --noEmit`, lint,
   and `next build` all clean.

---

## 2026-11-18 — The real EFIMS AI Service is live; `ml-gateway` wired to it, with real analyst-decision persistence

The ML developer announced the real EFIMS AI Service (v1.0) is live at
`https://efims-ai.onrender.com`, with a full integration spec (Swagger at `/docs`, an `X-API-Key`
auth header, exact request/response shapes for `severity/predict`, `anomaly/score`, and
`recovery/predict`, and five explicit integration rules). `ml-service-client.ts` — built in an
earlier session in anticipation of exactly this — turned out to already match the real spec's
field names, response envelope, and 422/503 handling verbatim; only two real gaps needed fixing:

1. **No `X-API-Key` header was ever sent.** The client's constructor only took a `baseUrl`; the
   real service 401s without the key. Added an optional `apiKey` constructor param, sourced from
   a new `ML_SERVICE_API_KEY` env var (never hardcoded, never in frontend code, never logged),
   plus an explicit 401 branch (`MlServiceClient.request`) distinguishing "wrong/missing key" from
   a generic unavailable, since it points at a specific misconfiguration, not an outage.
2. **The request timeout was 5 seconds.** The vendor's own rule #4: "Free hosting sleeps after 15
   minutes idle. The first request can take about a minute, so use a 90 second timeout." Raised
   `REQUEST_TIMEOUT_MS` to 90,000 — applied to every request, not just a detected-cold-start one,
   since there's no reliable client-side "just woke up" signal worth building and an already-warm
   instance still returns well inside 90s.

**New: durable prediction persistence**, closing the vendor's rule #3 ("Store every
`prediction_id` with the case, and record whether the analyst accepted or overrode it. That data
is used for retraining") — nothing like this existed before; predictions were only ever mentioned
in passing inside `AuditService` metadata, never queryable as their own record. Added
`MlPredictionRecord` (new Prisma model + migration `20261118153708_ml_prediction_records`, RLS
policy added to `rls-policies.sql`'s grant list and `FORCE ROW LEVEL SECURITY` loop): one row per
structured-model prediction (never a Groq-fallback one — those carry no vendor `prediction_id`,
so there's nothing to send back for retraining), `decision` starting `PENDING` and moving to
`ACCEPTED`/`OVERRIDDEN` exactly once, same one-way-decide shape as `ApprovalRequest`'s own
`decide()`. `MlGatewayService.suggestSeverity`/`scoreAnomaly`/`predictRecovery` now take an
optional `MlPredictionLogContext` (tenant/entity/requester) that `TriageService`, `RecoveryService`,
and `MlGatewayController.scoreAnomaly` all now pass through; a new
`PATCH /ml-gateway/predictions/:predictionId/decision` endpoint (audited) lets any non-reporter
role record a decision. Wired a minimal decide UI into the incident severity-suggestion panel
("Accepted" / "Went a different way") — the anomaly and recovery panels don't have one yet
(backend logging + the decide endpoint already cover all three capabilities; only that frontend
wiring is still open, tracked in `docs/OPEN_ITEMS.md`).

Also fixed a real stale-doc bug this surfaced: `MlGatewayService`'s own module-level doc comment
still said Groq was "an automatic fallback for severity," contradicting the 2026-11-14 decision
(elsewhere in the same file) that made it opt-in-only — corrected to match.

**Live-verified against the real hosted instance** (not just the unconfigured/mocked path):
health check (all three models `healthy`, `v1.0`), a real `severity/predict` call (S2 at 95.6%
confidence, `requires_human_review: false`, real `prediction_id`), a real `anomaly/score` call
through the full stack — login → controller → service → live vendor call → `MlPredictionRecord`
row confirmed written with the full raw response — the decide endpoint moving it to `ACCEPTED`,
and the one-way-decide guard correctly rejecting a second decision on the same prediction (400).
Confirmed the no-key case fails as intended (401 → `MlServiceUnavailableError`). `tsc --noEmit`,
lint, and `next build` all clean on both apps. Test data cleaned up after verification.

Updated `.env.example` (both the new var and `ML_SERVICE_BASE_URL`'s default, now the real URL —
previously `http://127.0.0.1:8000`), the real local `.env` (gitignored), and `render.yaml`
(`ML_SERVICE_BASE_URL` now the real URL as a plain value; `ML_SERVICE_API_KEY` added as
`sync: false`, prompted once at Blueprint creation, never committed). Closed the corresponding
`docs/OPEN_ITEMS.md` entry ("The ML engineer's real inference API is not yet delivered").

Carried over verbatim from the vendor's own doc rather than smoothed over, per this project's
standing rule: **models are trained on synthetic data — "use for integration and testing, not for
real decisions yet."**

---

## 2026-11-16 — Live production bug: deterministic "Reference code collision" blocking all signal validation

User hit a real, live-blocking bug: validating a signal into an incident (Triage Analyst account)
failed every single time with `400 Bad Request: "Reference code collision — retry validating this
signal"`, surviving repeated retries.

**Root cause**: `IncidentsService.generateReferenceCode` (and `CasesService`'s own, explicitly
documented as "identical") computed the next sequence number as
`COUNT(rows with this prefix) + 1`, not `MAX(existing sequence numbers) + 1`. That's only correct
while the sequence has no gaps. A gap had opened at `INC-2026-0007` (9 real rows existed:
0001-0006, then 0008-0010 — likely from earlier test-data cleanup this session), so `COUNT = 9`
recomputed `"INC-2026-0010"` — a code that already existed — and hit the
`(tenantId, referenceCode)` unique constraint (`P2002`). The catch block's own comment framed this
as a rare two-requests-at-once race worth a "just retry" response, but once a gap exists this is
**deterministic, not rare**: a rolled-back insert never changes the COUNT, so every retry
recomputed the exact same doomed code. Confirmed live — 3 fresh signal→validate attempts in a row
all failed identically — before touching any code, and root-caused by querying the real `incidents`
table directly via `DIRECT_URL` (bypassing RLS; the first pass mistakenly queried via the
RLS-governed `DATABASE_URL` role with no tenant context set, which correctly returns zero rows and
is not the same thing as an empty table).

**Fix**: both `IncidentsService.generateReferenceCode` and `CasesService.generateReferenceCode` now
fetch existing codes for the current prefix, parse out each one's numeric suffix, and use
`max(suffix) + 1` — correct regardless of any gap, past or future (a case/incident merge is a real,
ongoing source of exactly this kind of gap). `ConfigurationService.createDraft`'s version-numbering,
cross-referenced by both other generators' doc comments as sharing "the same race/backstop
pattern," was checked and found **not** vulnerable — it already used
`orderBy: { version: 'desc' }` (MAX-based) rather than `count()`, so no change was needed there.
The `(tenantId, referenceCode)`/`(tenantId, key, version)` unique constraints remain the correct
backstop for genuine concurrent-writer races; only the COUNT-vs-MAX computation was wrong.

Verified live post-fix: 3 fresh signal→validate attempts all succeeded (`201`), and the resulting
incidents correctly landed at `INC-2026-0011`, `-0012`, `-0013` — continuing past the 0007 gap
rather than recolliding with 0010. `tsc --noEmit` and lint clean on both touched files.

---

## 2026-11-16 (cont'd, 10th pass) — Real Render deploy failure: web-push is ESM-only, crashed the compiled build

First real Render deploy of the backend failed at boot: `Error [ERR_REQUIRE_ESM]: require() of ES
Module .../web-push/src/index.js ... not supported`. Root cause: `web-push@4.0.0` ships ESM-only
(`"type": "module"` in its own package.json, confirmed by reading it directly — no CommonJS build
exists for this package at all). The plain `import * as webpush from 'web-push'` added earlier
this session compiles to a `require()` call under this project's CommonJS build target, which
Node refuses outright for an ESM-only package. This never surfaced in any local testing because
`nest start --watch`'s dev-mode loader (ts-node/SWC-based) tolerates this differently than the
actual compiled output — Render's `node dist/main.js` is the first thing that ever ran the real
build. A real gap in this session's own verification discipline: the push-notification feature
was tested live, repeatedly, but only ever through the dev server, never through
`npm run build && npm run start`.

**Fixed in two steps, the second one only found by reading the actual compiled output.** First
attempt: switch to a dynamic `import('web-push')`, per Node's own error message's suggested fix.
Built, then grepped `dist/` directly — TypeScript had rewritten it into `Promise.resolve().then(()
=> require('web-push'))`, which still calls `require()` on an ESM-only package and would have
still thrown the same error, just one microtask later. Second, real fix: hid the import inside
`new Function('return import("web-push")')` so TypeScript's compiler never sees an `import()` AST
node to rewrite (it's just a string literal to the compiler) — confirmed by rebuilding and
re-grepping `dist/` a second time, this time finding a genuine, untouched `import("web-push")`
call.

**Verified properly, not just type-checked**: ran the actual production command
(`npm run build && npm run start`, i.e. exactly what Render's `startCommand` does) locally,
confirmed `Nest application successfully started` with zero `ERR_REQUIRE_ESM` anywhere in the
log, then ran the real cross-user task-assignment flow from the 2026-11-10 push-notification
verification again against this production build — got `PushDelivery` status `FAILED` with a
genuine `web-push` library validation error ("p256dh value should be 65 bytes long," expected,
since the test used a deliberately-fake key), not a crash. That's the same class of "correctly
fails because the test key is fake" result confirmed earlier via the dev server — now reproduced
identically against the actual compiled build Render runs.

---

## 2026-11-16 (cont'd, 9th pass) — Real CI failure, root-caused: a workflow ordering bug, not an app bug

First real CI run against `main` after today's merge failed its frontend job's `Typecheck` step —
`Cannot find name 'PageProps'`/`'LayoutProps'` on effectively every page/layout file. Root-caused
by fetching the actual check-run annotations via GitHub's public API (no `gh` CLI available in
this environment) rather than guessing from the step name alone: Next.js 16's typed-route global
types (`PageProps`/`LayoutProps`) are generated into `.next/types/` as a side effect of `next
build`/`next dev` actually running at least once — not present on a genuinely fresh checkout.
`ci.yml`'s frontend job ran a standalone `npx tsc --noEmit` step *before* `npm run build`, so on
CI's clean runner it failed immediately, every time. It had only ever looked fine on this
project's own dev machine because `.next/types/` was already populated from many earlier local
`next build`/`next dev` runs this session — a classic "works on my machine" gap, caught the
moment a truly clean environment (CI) ran the same command.

Verified `next build` already performs a full, real project-wide TypeScript check as part of
itself (`typescript.ignoreBuildErrors` is not set in `next.config.ts`, and the build's own output
literally logs "Running TypeScript ... Finished TypeScript in Ns") — so the separate step added
no real coverage, only a guaranteed-to-fail ordering dependency. Removed it; `Build` is the one
step that both builds and type-checks now. Verified the fix properly: deleted `.next` entirely
(the exact fresh-checkout condition CI starts from) and re-ran lint → build → audit-guard end to
end — all three pass cleanly with zero prior local state to lean on.

---

## 2026-11-16 (cont'd, 8th pass) — Render deployment: render.yaml, not Docker

User is about to host on Render and asked for the deployment pipeline gap (flagged since the
2026-11-02 audit, `docs/OPEN_ITEMS.md`) closed.

**Chose Render's native Node runtime over a Dockerfile** — simpler and lower-risk for a plain
NestJS + Next.js monorepo with no unusual system dependencies: no multi-stage build to get right,
no Prisma-engine-platform-target footgun, and Render's own Blueprint spec supports a monorepo's
sibling directories natively via `rootDir` per service. Wrote one `render.yaml` at the repo root
defining both services (`efims-backend`, `efims-frontend`), each scoped to its own subdirectory.

**Verified the Blueprint syntax against Render's real, current docs before writing anything** —
two rounds. First confirmed the core fields (`runtime: node`, `rootDir`, `buildCommand`/
`startCommand`, `healthCheckPath`, `envVars` with `sync: false`/`generateValue: true`) against
the official spec page. Then, for the cross-service URL wiring specifically (frontend needs the
backend's public URL and vice versa), the first draft used `fromService` with an `envVarKey:
RENDER_EXTERNAL_URL` — plausible-sounding, but a second, narrowly-scoped verification pass found
neither `envVarKey` nor `RENDER_EXTERNAL_URL` anywhere in the official docs: Render's confirmed
`fromService` properties (`host`/`port`/`hostport`/etc.) expose a service's *private*-network
address, not its public HTTPS URL, and there's no officially-documented Blueprint syntax for
copying one service's public URL into another's env var at all. Rather than ship unverified
syntax into a real deployment config, switched `CORS_ORIGINS` (backend) and `BACKEND_URL`/
`NEXT_PUBLIC_REALTIME_URL` (frontend) to `sync: false` — a one-time manual paste after each
service's first deploy, documented step-by-step in the new `docs/deployment.md`, in exchange for
certainty the Blueprint actually deploys instead of failing on an unconfirmed field.

**Also added**: a backend-independent `GET /api/health` route on the frontend (`efims-frontend/
src/app/api/health/route.ts`) for Render's own health check — every other route either requires a
session or calls the backend, either of which would fail the check for reasons unrelated to
whether the Next.js server itself is up. Had to also add `api/health` to `proxy.ts`'s matcher
exclusion list alongside the existing static-asset ones — without that, Render's cookie-less
health check would have been redirected to `/login` (a 307, not the 200 a health check needs),
found and fixed live before it could cause a false "service unhealthy" in production.

**Deliberately deferred, documented in `docs/deployment.md` rather than automated**: RLS policy
application (`prisma/rls-policies.sql`) only needs to run once, against a genuinely fresh
database — scripted as a one-time manual step, not wired into every deploy, same reasoning as
Prisma migrations being safely idempotent in `startCommand` while RLS setup is not.

---

## 2026-11-16 (cont'd, 7th pass) — Root-caused the session's recurring backend crashes; pre-demo design/data audit for Render hosting

User reported a `fetch failed` error and "some navigation taking me to old design," with explicit
context: about to host on Render and demo to their boss.

**Root-caused the real cause of this entire day's repeated "backend is down" incidents** — not
just Neon flakiness being unlucky, as assumed in every earlier pass. `@nestjs/schedule`'s `@Cron`
has no built-in error handling: an unhandled rejection inside a scheduled method crashes the
*entire Node process*, not just that one tick. Both of this codebase's cron jobs
(`SlaClockService.sweepBreachedClocks`, `NotificationsService.escalateUnread`, both
`EVERY_5_MINUTES`) queried the database with zero try/catch. Caught live in the act: a backend
log showed `PrismaOverloadFilter` gracefully handling two real overload events, then — three
`@Cron` ticks later — an uncaught `P1001` ("Can't reach database server," the same transient Neon
drop seen several times this session) from inside `sweepBreachedClocks`, immediately followed by
the process exiting. `NotificationsService` already had a `safely()` wrapper with a doc comment
explaining this *exact* mechanism for `@OnEvent` handlers — just never extended to either cron
job. Fixed: `escalateUnread` now wrapped in `safely()`; `sweepBreachedClocks` wrapped in an
equivalent try/catch (no helper to reuse across files, so mirrored inline). Also hardened
`PrismaOverloadFilter` itself, which had only ever covered the two error shapes the 3rd pass's
load test produced (`P2024`, `Transaction API error`) — `P1001` fell through its condition and
was rethrown, uncaught, for any request that happened to hit it directly. Expanded to cover the
whole family of Prisma connection-level codes (`P1001`/`P1002`/`P1008`/`P1017`/`P2024`) as one
`TRANSIENT_CONNECTIVITY_CODES` set.

**Design audit, not a regression**: screenshotted ~25 pages across Monitor/Manage/Govern/
Administration, every case-detail tab, and 5 different role dashboards (security, HR,
effectiveness reviewer, incident reporter, executive) in a real headless Chromium session —
zero instances of old fonts, old icons, or old colors anywhere. The most likely explanation for
what the user saw is a stale browser tab/bundle from before an earlier `.next` cache clear this
session, not a real regression — flagged back to the user rather than guessed at further.

**One real layout bug found during the same audit, fixed**: the signals queue's summary column
overlapped the status badge for any sufficiently long summary. Root cause: Tailwind's `truncate`
utility (`overflow: hidden` + `text-overflow: ellipsis` + `white-space: nowrap`) silently does
nothing on a `display: inline` element (the default for an `<a>`/`Link`) inside a `<table>` with
default auto layout — `<td>`-level `max-w-*` doesn't constrain an inline child's rendered width.
Fixed by adding `block` to that one `Link`. Audited every other `truncate` usage in the app
(12 files) for the same pattern — all others were already either on a naturally block-level
element (`<p>`, `<li>`, `<td>` itself) or explicitly `inline-block`/`block`, or (sidenav's
institution name) a direct flex child, which CSS "blockifies" automatically regardless of its own
`display` value — confirmed genuinely isolated, not systemic.

**Test/debug data cleanup, with explicit sign-off first**: found 8 signals, 3 incidents, 2 tasks,
and 1 notification left over from this session's own earlier debugging (reference-code-collision
repro, push-notification e2e tests) — all clearly fake ("verify fix test", "repro collision test",
"push e2e test task") and visible in the real Signals queue and a case's Tasks panel. Confirmed
none were linked to any case/SLA-clock/triage-assessment. The direct-SQL delete was blocked by
the sandbox's own destructive-action guard on the first attempt — correctly, since signals/
incidents have no delete path in the app by design (`REVOKE DELETE` in `rls-policies.sql`, an
intentional immutability choice) and this would bypass it. Asked the user explicitly before
retrying; they confirmed, then it was done.

---

## 2026-11-16 (cont'd, 6th pass) — Fixed a stale Turbopack cache crash, real toast notifications, the notification-count sync bug, and real Web Push

User hit a runtime crash (`chunk.reason.enqueueModel is not a function`, Next.js 16.4.3/Turbopack)
and asked for toast notifications, Socket.IO, and notification count to be addressed.

**The crash**: root-caused to `.next/cache` never being cleared after the 2026-11-02 Next.js
16.3.6→16.4.3 version bump — stale compiled Turbopack chunks referencing an old React Flight
internal shape. Fixed by stopping the dev server, deleting `.next` entirely, and restarting.
Separately, the backend had also gone down (a recurring pattern this whole session — Neon
connection drops) and needed its own clean restart; its downtime was what first looked like a
frontend bug ("Unable to reach EFIMS Core") when testing the fix. Verified with a real headless
Chromium session (Playwright, already cached locally) through login and every main page — zero
console/page errors.

**Toast notifications**: added `sonner` via the shadcn CLI, fixed its generated component to use
this project's actual Institutional Intelligence tokens (`--color-surface-container-lowest`, etc.)
instead of shadcn's generic `--popover`/`--border` defaults, which don't exist in this app's
`globals.css`. A new `RealtimeToastListener` (mounted once, in `(app)/layout.tsx` — the one shell
every authenticated page renders inside) shows a toast on every `notification.created` realtime
event, as a third independent consumer of `useRealtimeNotifications` alongside the existing badge
and notifications-list components (same "cheap to duplicate a socket" reasoning already
established for those two).

**Notification-count bug (real, found investigating the request)**: `NotificationBellBadge`'s
unread count only ever incremented — marking everything read on the notifications page (even in
the same tab) never decremented it, because the badge and the list are two independent components
with no shared state, and nothing told the badge a read had happened. Fixed at the source:
`NotificationsService.markRead` now emits `notification.read` to the user's realtime room (reusing
the existing per-user Socket.IO room, not a new channel), and `useRealtimeNotifications` gained an
optional second callback for it. The badge now decrements on that event — fixes the bug for the
same tab, another tab, and another device, since it goes through the same realtime infrastructure
`notification.created` already does, not local React state.

**Real Web Push** — the biggest piece, wired into a seam this codebase explicitly built and
deferred ("build the seam now, wire the real thing in later," same pattern as `ml-gateway` before
Groq): `NotificationChannel.PUSH` existed in the schema from the start, but `deliverExternal` only
ever logged a stub. Added: a `PushSubscription` Prisma model + migration + RLS policy (one
subscription per browser/device, upserted by its own unique `endpoint`); `web-push` installed
server-side with a freshly generated VAPID key pair (private half in `efims-backend/.env` only,
public half copied to `efims-frontend/.env.local` as `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — both values
generated via `web-push.generateVAPIDKeys()`, placeholders documented in both `.env.example`
files); `POST`/`DELETE /notifications/push-subscriptions` endpoints; `NotificationsService.
createAndDeliver` now fetches the recipient's subscriptions in the same transaction as creating
the notification row and fires a real `sendPush` for each — not awaited by the caller (a network
call to an external push service has no latency bound, and every caller of `createAndDeliver` is
already a loop over possibly many recipients), but never silently dropped either: every attempt
still writes a `NotificationDelivery` row (SENT/FAILED), and a 404/410 from the push service
(subscription no longer exists on the browser's end) prunes that row immediately instead of
retrying forever. Frontend: `public/sw.js` (a minimal push-only service worker — this app has no
other offline/caching need), `usePushSubscription` (registers the worker, exposes subscribe/
unsubscribe, never auto-subscribes — that would mean silently requesting OS notification
permission without the user asking), and an explicit opt-in/out toggle on the notifications page.

**Verified, honestly**: the full backend pipeline end-to-end, live — subscribed a real user,
triggered a genuine cross-user `task.assigned` event (self-assignment is deliberately not
notified, confirmed existing behavior, not a bug), confirmed a real `PUSH` `NotificationDelivery`
row was written with `status: FAILED` (correct — the test used a fake endpoint) and that the
triggering request (task creation) returned `201` immediately, unaffected by the slow/failing push
call underneath. The frontend subscribe flow was verified up to the exact point a real browser
differs from this one: service worker registration, the permission prompt, and VAPID key
conversion all work, but Playwright's bundled test Chromium has no Google API key baked in (unlike
a real Chrome install), so the final `pushManager.subscribe()` hop fails with "push service not
available" — a known, documented limitation of testing the Push API in CI/headless Chromium
generally, not something fixable from this app's code. A real Chrome browser on an actual device
is needed for the final confirmation that an OS-level notification arrives; not done in this
session.

---

## 2026-11-16 (cont'd, 5th pass) — Production-latency proxy test: confirms today's whole investigation was dev-environment latency, not an architectural ceiling

User asked to follow through on the remaining open item from the 4th pass — real evidence for
what this exact code would do co-located with its database (production topology), instead of
leaving it as a reasoned-but-unverified projection.

**Method**: rather than guess, or touch the real Neon project, built a disposable local proxy —
this machine already runs a local PostgreSQL 17 service (unrelated to this project). With the
user's explicit permission and the local superuser password (never written to any file or printed
to any log), created a throwaway `efims_prodproxy_test` database, applied the real
`prisma migrate deploy` + `prisma/rls-policies.sql` (the exact same schema and RLS setup, including
the real `efims_app` role) that a fresh production database would get, seeded it with
`npm run seed`, and ran a **second, fully isolated backend instance on port 3002** (via exported
env vars only, never touching `efims-backend/.env` or the real running dev instance on 3001) to
run the identical load-test scripts from the 3rd/4th passes against it.

**Result — decisive**: single `GET /cases`, ~5.6s on the real dev setup (Neon, `us-east-2`,
~230ms RTT) → **19ms** against the local instance (near-zero RTT) — a ~295x difference, for the
exact same code. Single `GET /cases/stats`: 3.9s → 24ms. Concurrency 10 and 40, both 100% success
on the dev setup after this session's earlier fixes, now complete in **under 200ms max** on the
local instance instead of up to ~7.5s. Pushed to concurrency=100: the database/backend layer never
became the bottleneck at all — the only failures were 52/100 `429`s from the *same* IP-based
global rate limiter found in the 3rd pass (an intentional, correctly-functioning security control,
not a capacity problem), and the 48 that succeeded all completed in 110-265ms.

**What this settles**: every single slowness and concurrency-ceiling finding from today's 1st
through 4th passes — the original "5 seconds per page" report, the connection-pool exhaustion, the
audit-lock queueing under concurrent load — was downstream of this dev environment's cross-region
database latency, not a structural flaw in the application code. The fixes made along the way
(transaction consolidation, connection pool sizing, the audit round-trip reduction, removing the
list-filtering audit write) are all still correct and worth keeping — they reduce absolute round
trips and lock-hold time regardless of RTT — but the finding here is that **latency, not instance
count, was the dominant variable**. A single backend instance, properly co-located with its
database, shows no sign of needing horizontal scaling at any concurrency level this session could
practically generate from one test machine.

**What this does NOT settle**: this is a local-machine proxy, not the real target production
topology (an actual Render instance + an actual Neon project in the same region, over a real
network hop rather than localhost's loopback). Directionally very strong evidence, not a
substitute for a real pre-launch load test against that actual pair once provisioned. Test database
and the temporary second backend instance were both torn down immediately after — nothing from
this proxy setup persists.

---

## 2026-11-16 (cont'd, 4th pass) — Audit policy call: list-view filtering isn't a "denial"; removing that write was the real fix

Before chasing the 3rd pass's remaining concurrency ceiling further, the user asked a policy
question that turned out to undercut the whole investigation's biggest remaining cost: is a case
being silently excluded from a list/stats view actually a "denial" under CLAUDE.md non-negotiable
#6 ("any denial is itself written as an audit event"), or does that non-negotiable only mean a
*specific request* for a case the user can't open (`assertAccess`'s domain — e.g. `GET /cases/:id`
returning 403)?

Traced the `cases.case.list_filtered` write (added 2026-11-14/15 during an earlier hardening pass)
back to its origin instead of assuming it was settled: `docs/engineering/implementation-assessment.md`
finding #6 flagged it as "a real gap against CLAUDE.md's **literal** 'any denial...'" — the
assessment's own word "literal" already hedging that this was a textual reading, not a confirmed
policy interpretation — and it was implemented directly in a later session without ever going
through `AskUserQuestion` the way the Groq-fallback policy conflict in that same assessment did.
Checked `docs/DECISIONS.md` (no entry) and `docs/configuration-decisions.md`'s CD-01–CD-08
ownership table (none of the 8 items cover audit-event granularity for access filtering) — this
specific question had no assigned owner anywhere in the project's existing structure. Presented
both readings to the user with a recommendation (narrow); **the user decided: narrow** — list/stats
filtering is routine row-level security, not an access attempt, and gets no audit event at all.

**Removed `cases.case.list_filtered` entirely.** `CasesService.getVisibleCases` reverted to a plain
access filter (no denial-detail collection, no `auditService.record` call); `list()`/`stats()`
reverted to their simpler pre-concurrency-fix shape (no `buildResult()`/`auditWrite` split, since
there's no longer a second write to run concurrently with anything); `getVisibleCaseIds` reverted
to a two-line wrapper. `AuditService.record`'s `opts.rethrowOnFailure` (added in the 2nd pass
specifically for this one call site) was removed too, rather than left as unused speculative
surface — nothing else in the codebase ever called it with that option.

**Measured impact — this was the single biggest win of the entire 2026-11-16 investigation**:
single `GET /cases` dropped from ~9.3-11.7s (pre- any of today's fixes) to **~5.6s** (no other
change between these two numbers besides this one write's removal). More importantly for the
user's original concurrency concern: a live load test with this write gone handled **40 concurrent
`/cases` requests from one source with zero failures** (previously, even after the 3rd pass's pool
and round-trip fixes, 20 concurrent requests still failed 4/10 and 30-40 failed worse). Pushed to
60-80 concurrent requests from one test process and got 429s — confirmed via the response body
(`ThrottlerException`) and `app.module.ts`'s `ThrottlerModule` config (100 req/60s, tracked by IP,
NestJS's default) that this is the *unrelated*, correctly-functioning global rate limiter reacting
to one IP firing a burst, not a database capacity ceiling — a real many-different-users production
scenario wouldn't share one IP's throttle bucket the way one test script sharing one machine does.

**What this changes about the still-open item from the 3rd pass**: `AuditService.record`'s
per-tenant lock-queueing under concurrency is still real and still inherent to a hash-chain's
correctness requirement — but it's no longer on the hot path for the two highest-traffic endpoints
in the app (every ordinary case list/stats page load). It still applies to genuine
`assertAccess`-path denials and every other audit-writing action in the app, just at a far lower
natural frequency than "every list page load, for every user." The connection-pool fix
(`connection_limit=60`) and the lock round-trip reduction from the 3rd pass both remain in place
and still apply to those.

---

## 2026-11-16 (cont'd, 3rd pass) — Real concurrency load testing: connection pool exhaustion, audit-lock queueing, graceful degradation

User, unconvinced single-request latency fixes alone would hold up with many simultaneous users,
asked for "what's professionally necessary" for production-grade concurrency — explicitly wary of
delays compounding into minutes-long waits. Ran actual concurrent-load tests (`Promise.allSettled`
firing 2/5/10/20/30/40 simultaneous `/cases` requests) against the real backend, rather than
reasoning about it abstractly.

**Finding #1 (real, confirmed via the exact Prisma error message): connection pool exhaustion.**
`DATABASE_URL` never explicitly set `connection_limit`, so Prisma defaulted to 9 (this machine's
core count × 2 + 1). Every `CasesService.list`/`stats` call needs 2 simultaneous connections (its
own transaction, plus `AuditService.record`'s separately-isolated one — true regardless of
sequential or concurrent scheduling, since `audit` deliberately never shares a caller's
transaction). At just 10 concurrent requests, 7/10 failed outright with
`PrismaClientKnownRequestError: Timed out fetching a new connection from the connection pool`.
Checked Neon's real ceiling first (`SHOW max_connections` via `DIRECT_URL`: 901, with only ~22 in
use) before raising anything — confirmed massive headroom on the already-pooled (PgBouncer)
endpoint. Set `connection_limit=60&pool_timeout=20` on `DATABASE_URL`. Verified: concurrency=10
failures went from 7/10 to 0/10.

**Finding #2 (real, found after #1 removed pool exhaustion as the dominant cause): audit hash-chain
lock queueing.** At concurrency=20+, failures persisted — now `"Transaction already closed... the
interactive transaction timeout"`, not a pool error. `AuditService.record`'s
`pg_advisory_xact_lock(hashtext(tenantId))` necessarily serializes every audit write for the same
tenant (this is what prevents the hash chain from forking under concurrent writers — a correctness
requirement, not a performance bug, and explicitly NOT weakened here). Under enough simultaneous
same-tenant users, writes queue behind each other long enough to cross the transaction's 20s
timeout. Fixed the only thing safely fixable without touching that guarantee: shrank how long each
write holds the lock, by combining the lock acquisition and the "latest hash" lookup (previously
two sequential round trips — `$executeRaw` then `findFirst`) into one `$queryRaw` call using a
`MATERIALIZED` CTE, verified correct against raw Postgres first (confirmed the lock's side effect
still fires even when zero prior rows exist, via `pg_locks`) before changing the real code path.
Verified live: concurrency=20 failures dropped from 7/10 to 4/10 on the same test.

**Tried and reverted**: raising the interactive-transaction `timeout` from 20s to 30s as a cushion.
A repeat load test showed no consistent improvement — contention grows to fill the extra time
rather than resolving, and a longer timeout runs directly against the user's explicit concern
(long waits), not toward it. Reverted to 20s.

**Finding #3 (addressed directly, not a "fix" but the professionally correct response to a real
ceiling): no graceful degradation existed.** Whatever WAS failing returned a bare, generic
`500 Internal server error` — indistinguishable from a real bug to a caller. Added
`PrismaOverloadFilter` (`src/common/filters/prisma-overload.filter.ts`), a global exception filter
catching exactly the two Prisma error shapes this load test produced (`P2024` connection-pool
timeout; the "Transaction API error" interactive-transaction expiry) and returning a clean
`503` + `Retry-After: 5` with a human-readable message — everything else passes through unchanged.
Verified live: concurrency up to 20 now succeeds 100% of the time on repeat runs; concurrency
30-40 (genuinely beyond this single dev backend instance's capacity against a remote database)
now fails fast with the clean 503, never a long hang or a confusing crash.

**Explicitly not done, and why — this is the honest ceiling of what today's session can respon-
sibly claim**: this dev environment's ~230ms RTT to Neon (`us-east-2`) inflates every one of these
costs by roughly the same multiple a co-located production deployment wouldn't pay — the SAME code,
run with backend and database in the same region, would likely clear a far higher concurrency
ceiling before hitting either of today's two bottlenecks. Confirming that requires a real load test
against actual target production infrastructure, not this dev setup — not done here. True
high-scale concurrency (hundreds of simultaneous same-tenant users) would need: horizontal backend
scaling (blocked today on the already-documented single-instance-only rate-limiter/cache — see the
2026-11-02 production-readiness audit), and/or batching audit writes instead of one hash-chain
append per request. Both are real architectural decisions for the user to prioritize, not
something to silently build into a performance-investigation session.

---

## 2026-11-16 (cont'd, 2nd pass) — Constraint-driven fix: run the cases list-filtered audit append concurrently with its own enrichment queries, not before or after

Direct follow-up to the pass below, executed against an explicit, detailed constraint list the user
provided (preserve hash-chain integrity/canonicalization/locking/append-only; keep every individual
denied case id + reason traceable from the one summarized event, not just reason-category counts;
run the list query and the audit append concurrently, only after access control has established the
filtered case ids; await both before returning success; never silently return 200 if the audit write
fails; no audit event schema change without inspecting real consumers first; implement only this,
then stop).

**`AuditService.record`**: added an optional `opts.rethrowOnFailure` (default off, so the other ~40
call sites — login, every other denial — keep their existing "log and swallow" behavior unchanged).
**`CasesService.getVisibleCases`**: now collects per-case `{caseId, reason}` denial detail (not just
`byReason` counts), and returns `{ visible, auditWrite }` instead of awaiting the audit write inline
— `auditWrite` is already-started, not yet awaited. **`list()`/`stats()`**: their downstream
enrichment work (teams, incident counts, severity/SLA, loss/recovery) now runs inside a
`buildResult()` closure executed concurrently with `auditWrite` via `Promise.all`, both awaited
before the method returns — a failed audit write (now rethrown) fails the whole request instead of
silently returning filtered data with no record of why. Inspected before changing: `metadata` is a
loose `Record<string, unknown>`/`Json?` on both ends, `audit-hash.ts`'s `canonicalize()` already
handles arrays of objects generically, and a repo-wide search found zero frontend or backend code
reading this action's metadata by shape — adding `deniedCases` alongside the existing `byReason` is
additive, not a breaking schema change.

Verified: `tsc`/lint clean; `GET /cases` still returns the same data as before; `GET
/audit-events/verify` shows the same 3 pre-existing, already-documented 2026-09-24 breaks and zero
new ones (confirms the new field hashes and round-trips through JSONB correctly). Measured (fully
isolated, no concurrent traffic): baseline (sequential) ~9.3-11.7s; after (concurrent) ~5.2-5.9s
steady-state — consistent with the ~4s audit write and ~2.5s enrichment work now overlapping instead
of summing. Statement count is unchanged — this is a concurrency fix, not a reduction in DB work.
Not tested: the failure path (a real forced audit-write failure) was verified by code inspection
only, not a live failure injection.

---

## 2026-11-16 (cont'd) — Investigated "5 seconds per page navigation", fixed a real transaction-count bug, found the rest is dev-environment-inherent

User reported page-to-page navigation taking ~5s and asked whether something was wrong with their
system. Measured rather than guessed: raw React/Next.js render time is sub-100ms (confirmed), so
the delay is 100% backend/database round-trip time, not the frontend or the user's machine.

**Root cause #1 (real code bug, fixed)**: `IncidentsService.getVisibleIncidents`/`getById` opened
two separate `forCurrentTenant` transactions per call (the incident read, then a second one for
`getGrantedCompartments`) instead of sharing one. `CasesService.getVisibleCases`/`list`/`stats`
had the same shape at a larger scale — `list()` alone opened up to 3 separate transactions
(`getVisibleCases`, the teams+incident-count read, `computeSeverityAndOverdue`). Each
`forCurrentTenant` call is a real `BEGIN`/`SET_CONFIG`/`COMMIT` round trip to Neon; this dev
environment's database (`us-east-2`, Ohio) measures ~230-250ms RTT from this machine, so every
extra transaction cost a fixed, avoidable tax regardless of query complexity. Fixed by threading an
optional `tx` parameter through `getGrantedCompartments` (incidents), and through
`getVisibleCases`/`computeSeverityAndOverdue` (cases) so `list()`/`stats()` each run as one shared
transaction instead of three. Verified live: `GET /incidents` dropped from 2.5-4.6s to ~1.2-1.8s,
a real, repeatable improvement.

**Root cause #2 (structural, not fixable from this codebase alone)**: raw network RTT to Neon from
this dev machine is ~230-250ms per round trip — confirmed with a raw `pg` client, no Prisma or app
code involved. In a real production deployment, backend and database are co-located in the same
region (sub-5ms RTT); this dev setup's cross-region latency doesn't reflect what users would see
in production, but it is real for local development right now.

**Root cause #3 (real, found, not changed without the user's input)**: `CasesService.getVisibleCases`
writes one summarized `cases.case.list_filtered` audit event per call whenever any case is denied
(`AuditService.record`, added 2026-11-02 for the batch-access-denial gap) — and `AuditService.record`
always opens its *own* transaction (by design: the advisory lock serializing a tenant's hash chain,
non-negotiable #3, is a deliberately separate concern from the caller's transaction). That one
audit write measured ~4s on its own in a fully isolated test (no concurrent traffic) — confirmed via
a raw-`pg` replay of the identical lock+select+insert pattern, which took ~1s for the same logical
work, and an `EXPLAIN ANALYZE` on the "latest hash" lookup, which showed the index
(`audit_events_tenantId_createdAt_idx`) working perfectly (0.085ms execution time, 1150 rows, no
table-bloat issue). The ~4x gap between raw `pg` and the same operation through Prisma's interactive
transaction appears to be Prisma's own per-statement protocol overhead, which compounds
multiplicatively with this environment's high base RTT. Not changed in this session — making the
denial audit write non-blocking would mean the HTTP response could return before the audit event is
guaranteed written, which touches non-negotiable #6's audit-on-denial guarantee; that's a tradeoff
for the user to decide on, not something to silently change while investigating a performance report.

**Also found, not a code bug**: the backend's connection to Neon dropped outright twice during this
session's restarts (`PrismaClientInitializationError: Can't reach database server`, error P1001) —
consistent with Neon's serverless compute auto-suspending after idle and needing a moment to wake on
reconnect. A simple restart recovered both times.

**Process hygiene note**: repeated manual dev-server restarts during this investigation left 3-4
orphaned `nest start --watch` processes competing for port 3001 at one point, which produced
misleading, inconsistent timing measurements until all of them were killed and exactly one clean
instance was confirmed via `netstat`. Worth remembering for any future live-timing investigation in
this project: verify a single clean process before trusting measurements.

---

## 2026-11-14 (cont'd) — Full page-by-page QA pass: Overview through every main page, case-detail tab, and shell modal

The comprehensive Track B8 live-verification pass the redesign plan called for — every main
sidenav page, all 7 case-detail tabs, the quick-preview drawer, the command palette, and the
responsive shell, checked live against a real running backend, not just `tsc`/lint.

Split into 5 parallel verification passes (Overview/Monitor, full Cases module, Manage-section
registers, Govern-section pages, Administration + shell modals) — each logged in as a real seeded
user, screenshotted every page, checked for console errors, and fixed small clear bugs directly
rather than just reporting them.

**Real bugs found and fixed (13 total)**: the icon-migration sweep two sessions ago was scoped to
Material-Symbols→Lucide specifically and never went back to re-check every page's `font-headline`
usage against the later "drop serif except major editorial headings" decision — 12 pages had kept
the old serif h1 as a result (`cases/new`, `notifications`, `referrals`, `users` ×4, `configuration`,
`incidents/[id]`, `signals/[id]`, `signals/new`, `tools/transaction-risk-scoring`). All fixed, plus
the `login`/`platform/login` pages' own brand-mark lockups (which had kept serif on the "EFIMS"
wordmark even though the sidenav's real brand mark already uses plain sans — now consistent, with
the plain "E" letter mark replaced by the same `ShieldCheck` icon the sidenav uses) and
`platform/(authenticated)/page.tsx`'s "Tenants" h1. Also fixed: a stale "Remediation" label on the
case right-rail that should have read "CAPA" after that nav rename, and one leftover `rounded-2xl`
card on `operational-queue-table.tsx`. A repo-wide grep after all fixes confirms zero remaining
`font-headline` class usages anywhere in the app.

**Confirmed NOT bugs** (investigated, ruled out, nothing changed): a "₦NO" rendering on the
Recovery page turned out to be a correctly-computed "₦0" (the ₦ glyph's strikethrough-N shape
reads oddly next to a bare zero at small screenshot scale); the Audit page's outcome filters are
real `<Link>`s with query params, not buttons, so a button-selector test failure was the test's
own mistake; the command-palette "case" search and a user-detail-page navigation both appeared
broken under the heavy concurrent load of 5 parallel verification passes hitting the same
single-instance backend/Neon pool at once, and both were cleanly confirmed working correctly once
re-tested in isolation afterward — the same "test impatience vs. this dev DB's real ~10-13s
latency" class of false positive this project has hit and ruled out more than once before.

All fixes verified together: `npx tsc --noEmit` and `npm run lint` clean on the frontend (only the
pre-existing, unrelated `scripts/audit-guard.js` lint errors remain).

---

## 2026-11-14 (cont'd) — Backend Phase 1: the 5 net-new module-boundary/audit/hash findings, closed

Closed all 5 of the Phase 0 engineering assessment's "small, well-isolated" findings, not just
documented them.

**Module-boundary violations (non-negotiable #2)**: `CasesService.stats()` no longer queries
`lossEntry`/`recoveryEntry`/`approvalRequest` directly. `ApprovalService` gained `countPending`
(same "take an already-resolved case-id list, no `CasesService` dependency" shape as its existing
`listAll`). The loss/recovery total needed a different fix — `RecoveryModule` already imports
`CasesModule` for its own access checks, so `CasesModule` importing `RecoveryModule` back would be
a real circular module dependency NestJS refuses without `forwardRef()`. Used a plain,
dependency-injection-free function instead (`recovery/recovery-ledger.util.ts`) — the recovery
module's own code still runs the query, just not wired through Nest's injector, so there's no
cycle at all. `RecoveryService.listAll` and `InvestigationsService.listAll` each used to run
`tx.case.findMany(...)` directly too, for a display-only reference/title join — both now call a
new `CasesService.getCaseSummariesByIds()`, the normal direction (both modules already import
`CasesModule`, no cycle).

**Reopen-from-CLOSED asymmetry**: closing a case requires a maker-checker-approved decision;
reopening one required nothing. A full approval gate would need a new `ApprovalAction` enum value,
a migration, and a CD-04 approval-matrix entry — CD-04 is still an unratified draft, not something
to extend silently inside a "small fix." Closed the gap with what's available today instead: only
an `ELEVATED_ROLES` actor may reopen a closed case, and must give a real reason (≥5 characters).

**`isAccessible`'s un-audited batch denials**: the single-record access path audited every denial;
the batch/list path (used by `list()`/`stats()`/every cross-module `getVisibleCaseIds` caller)
didn't audit anything. Auditing per-case would mean dozens of audit rows on every ordinary list
page load — most of that filtering is routine team/compartment scoping, not a meaningful security
event each time. `getVisibleCases` now writes one summarized `cases.case.list_filtered` audit
event per call (counts by denial reason) when anything was filtered, not one row per case.

**The latent `Prisma.Decimal` hash landmine**: same bug class as the already-fixed `Date` issue —
`Decimal` has no own enumerable properties either, so `canonicalize()` would silently hash it as
`{}`. Added the same recursive-string-conversion branch the `Date` fix used, matching what
`decimal.js`'s own `toJSON()` (what the JSONB write path actually calls) does.

**Verification**: found and fixed two real, pre-existing, unrelated issues along the way — the
`efims_test` database was missing two migrations from before this session even started (causing
unrelated e2e failures the first run surfaced), and `tenant-isolation.e2e-spec.ts` times out in
its own fixture setup under current Neon connection conditions (reproduced in isolation, not
caused by anything in this pass — see `docs/OPEN_ITEMS.md`'s new entries on both). After the
migration fix, 5 of 6 e2e suites pass cleanly (30 tests, including `case-access-matrix` and
`containment-gate`, which exercise much of the same access-control code these fixes touched); the
6th's `beforeAll` timeout was independently worked around with a fast, direct, targeted recheck of
the actual RLS guarantee against the real dev database, which passed instantly.

---

## 2026-11-14 (cont'd) — Responsive/accessibility pass on the application shell; Recent-activity/brand cards; Groq fallback made opt-in

Continued the same day's redesign with the remaining Track B items.

**Shell responsiveness** (previously zero — a permanently `fixed w-64` sidebar with no way to
reach it below desktop width): new `MobileNavProvider` context (`sidenav.tsx` and `topnav.tsx` are
siblings, not parent/child, so the topnav's hamburger needs a shared state holder to control the
sidebar) drives an off-canvas sidebar below the `lg` breakpoint — dismissible overlay, a close
button inside the sidebar itself, auto-closes on navigation (adjusted during render per React's
documented pattern, not inside a `useEffect`, after lint first flagged the naive version as a
cascading-render risk). `<main>` drops its reserved `ml-64` margin below `lg`; the topnav degrades
its own content progressively (institution name hidden below `sm`, user email/role hidden below
`md`, never fully losing identity context). `DetailDrawer` gained `max-w-[90vw]` so its fixed
480/640px width can't force horizontal scroll on a phone. Verified live at 375px/820px/1440px
viewports — hamburger present and functional below `lg`, correctly absent at `lg`+, zero console
errors.

**Accessibility**: every icon-only shell control (hamburger, sidebar close, notification bell,
sign-out in both the tenant and platform shells, drawer close) gained a real `aria-label` — a
`title` attribute alone isn't a reliable accessible name for assistive technology. `DetailDrawer`
gained `role="dialog"`/`aria-modal`/`aria-labelledby` (it closed on Escape already but was never
announced as a dialog). `prefers-reduced-motion: reduce` is now respected globally. Verified live:
full keyboard Tab order reaches every sidebar link in visual order with a visible focus ring.
New `docs/design/responsive-guidelines.md` documents exactly what was and wasn't covered — notably
not a certified WCAG/axe-core audit, and not yet a page-by-page sweep beyond the shell itself.

**Closed the remaining visual gap against the reference image**: `QueueDashboard` gained a real
"Recent activity" timeline (fed by the same `listNotifications` call `TopNav` already makes — no
new data source invented) and a static dark brand card, matching the reference's bottom row.

**Groq severity-fallback decision, resolved and shipped** (flagged as open in the Phase 0
assessment, not left open): chose the middle option from that doc's own three — opt-in only, not
automatic. `MlGatewayService.suggestSeverity` now takes `allowLlmFallback`; omitted, an unreachable
EFIMS AI Service or a risk-factor-incomplete incident returns a clean 503 (matching anomaly/
recovery's existing behavior) instead of silently calling Groq. `TriageController`'s
`GET .../suggestion` route and the frontend's `SeveritySuggestionPanel` both thread the flag
through — the panel shows a second, explicit "Try an LLM-estimated severity instead" button only
after the first request 503s. `CLAUDE.md` non-negotiable #4 and the engineering assessment's
"decision needed" section both updated to reflect this as resolved. Verified live: the unavailable
path correctly 503s, the opt-in retry correctly falls back to Groq with the advisory disclaimer
and "Groq (fallback)" source label intact.

---

## 2026-11-14 — Two master directives: backend Phase 0 engineering audit + total frontend redesign ("Institutional Intelligence")

User issued two large, formal engineering directives in one session: a full backend/architecture
audit-and-hardening pass, and a from-scratch frontend visual/UX redesign. Mapped into one combined
phased roadmap (plan file: see the session's approved plan) — both tracks run in parallel, since
they touch almost entirely disjoint files and neither changes an existing REST contract.

**Backend Phase 0** (discovery only, no architecture changes yet): four parallel, read-only,
code-verified audits (module boundaries, ml-gateway-vs-vendor-contract compliance, frontend
architecture, security/ops) produced `docs/engineering/implementation-assessment.md`. Found 15
net-new findings beyond the project's own existing `docs/OPEN_ITEMS.md` tracker — real ones worth
naming: `CasesService.stats()` and two other services query tables they don't own directly instead
of going through those modules' public interfaces (a real non-negotiable #2 violation); reopening
a `CLOSED` case has no approval guard even though closing one requires one; the case-access rule's
batch/list path never audits its denials, only the single-record path does; a latent audit-hash
landmine (`canonicalize()` has no `Prisma.Decimal` branch, same bug class as the already-fixed
`Date` bug, just not yet triggered). Also surfaced one real policy conflict needing a human
decision: the new directive bans Groq as an automatic fallback for a failed predictive-model call,
but the shipped code (and this file's own non-negotiable #4) does exactly that for severity
prediction. **Resolved**: middle ground — severity fallback becomes opt-in per request ("LLM-
estimated severity"), not automatic. Non-negotiable #4 updated accordingly (see below).

**Frontend total redesign — "Institutional Intelligence."** Replaces "Botanical Precision"
wholesale (not a blend, a full swap) against a user-supplied reference image: navy ink (`#172B45`)
sidebar/brand + teal (`#167D83`) as the one real interactive accent, Inter + IBM Plex Mono
replacing Plus Jakarta Sans/JetBrains Mono, and — the biggest single mechanical change — every one
of ~164 Material Symbols Outlined icon usages across 46 files replaced with real `lucide-react`
components (the ligature icon font's `<link>` and CSS rule both removed entirely, not just
unused), per explicit instruction that the result must not read as a generic/AI-templated icon
set. Because the app already routed every color through a semantic CSS-variable indirection layer
(`var(--color-primary)` etc., never a literal hex in ~160 call sites), the full palette swap was a
single-file change to `globals.css` — the icon migration was the real scope, done as 5 parallel
agents each covering a cluster of files, then verified together with one full-project `tsc`/lint
pass and a 17-page live Playwright sweep (zero console errors).

Sidenav IA regrouped to match the reference's MONITOR/MANAGE/GOVERN/ADMINISTRATION split more
precisely than before (Cases/Investigations/Evidence move from MONITOR to MANAGE, matching the
directive's own "understand vs. resolve" definitions; `/signals` and `/incidents` — already real,
substantial pages — gained direct nav links instead of being reached only through `/intake`'s tab
switcher). `QueueDashboard` (the shared shell driving 16 of 20 roles) gained: uniform white KPI
tiles with a colored icon badge (replacing the old dark "hero" card), a real "Case severity mix"
segmented bar in the reference's donut slot (no fabricated "68% Overall Risk" — no risk-scoring
model produces that number, so real `CaseStats.bySeverity` data went in its place instead), a
"Matters requiring attention" panel, and a "Recent activity" timeline fed by real notifications
(the same `listNotifications` call `TopNav` already made) plus a static brand card — the two
pieces the reference image's bottom row showed that this pass hadn't covered yet in an earlier
cut. `StatusBadge` gained real `success`/`warning-status`/`info` tokens (previously reused brand
tokens as a stand-in).

One real bug caught mid-migration: `executive-dashboard.tsx`'s severity/status color maps held
literal hex values that had silently drifted from the new palette the moment `globals.css`
changed — found and fixed by the fork doing that file, not left stale.

New docs: `docs/design/design-tokens.md` (current, accurate token reference — supersedes
`docs/design-system.md`'s now-stale color/font tables, which gained a pointer to this instead of
being deleted), `docs/design/role-workspace-mapping.md` (built from the actual `Role` enum and
`roles.ts` permission constants, confirming the shared-shell-with-per-role-composition
architecture the directive asked for was already built during the 2026-10-14 twenty-role
expansion — this pass re-skinned it, not rebuilt it), `docs/design/frontend-redesign-assessment.md`
(the Phase 0 deliverable, written honestly noting it was produced alongside implementation rather
than strictly before it, since the reference image's token spec was detailed enough to build from
immediately).

**Deferred, explicitly**: responsive/mobile audit, an icon-accessibility (`aria-label`) sweep,
Storybook (not configured in this project; directive's own fallback says not to let that block
implementation), `docs/design/interaction-patterns.md`/`responsive-guidelines.md` (nothing yet
decided that warrants documenting).

---

## 2026-11-13 — Cases queue rebuild against a new mockup reference, bulk assign/escalate, and a latency pass on `getVisibleCases`

A new, higher-fidelity Lovable-hosted mockup reference (distinct from the existing
`mockups/screens/*.html` set) prompted a rebuild of the Cases queue page specifically, then a
broader generalization once a 35-screen contact sheet showed the same KPI/trend/queue-table shape
recurring everywhere.

**Backend**: `TriageService.getLatestSeverityByIncidentIds` and
`SlaClockService.getBreachedIncidentIds` — two new small, batched cross-module reads — let
`CasesService.list`/`stats` compute per-case `effectiveSeverity`/`isOverdue` (added to
`CaseListItem`) and `bySeverity`/`overdueCount` (added to `CaseStats`) without `CasesService`
reaching into tables it doesn't own (non-negotiable #2). `CasesService.bulkAssignTeam`/
`bulkEscalate` added — partial-success shape (a batch of 6 with one stale id doesn't fail the
other 5), looping the existing single-case methods rather than duplicating their logic; escalate
emits one new `CASE_ESCALATED_EVENT` per batch, notifying the assigned team's lead (falling back
to the whole team if no member currently holds that role). New routes: `POST /cases/bulk-assign`,
`POST /cases/bulk-escalate`.

**Frontend**: Cases queue rebuilt with a real KPI strip (severity-tier counts, not fabricated), a
"Sample data" badge, bulk checkbox selection feeding the new bulk endpoints, and a segmented
All/S1–S2/Overdue filter. Generalized the same pattern into `QueueDashboard`/`dashboard-loaders.ts`
for the 8 case-based roles beyond just the dedicated Cases page (institution-wide trend +
needs-attention strip + a real filterable/paginated `OperationalQueueTable`, reusing
`CaseListItem`'s new fields) — the other 8 non-case-based roles kept their simpler flat list,
since forcing severity/team/SLA columns onto e.g. an evidence or CAPA queue would mean inventing
fields that entity doesn't have.

**Performance**: found and fixed the real dominant cost behind an apparent "navigation doesn't
work" bug report (it was ~10-13s real latency on this dev DB, not a defect) — merged several
previously-sequential `forCurrentTenant` transactions into one each (`getVisibleCases`,
`computeSeverityAndOverdue`, `list()`'s team/incident-count lookup), cutting a typical `/cases`
load from ~9 database round trips to ~3. Re-verified the 7-condition case-access rule and RLS
tenant isolation held identically afterward, given `getVisibleCases`'s blast radius across the
whole app.

---

## 2026-11-11 — Real EFIMS AI Service integration (replaces Groq as primary severity engine)

User's ML developer delivered a real, separately-running Python/FastAPI service ("EFIMS AI
Service v1.0") exposing three trained models over HTTP: severity prediction, transaction anomaly
scoring, and recovery-probability prediction — full contract (request/response shapes, accepted
enum values, error codes, human-review thresholds) in a reference document, not the running
service itself. User's explicit direction: this service becomes the source of truth for
everything it covers; Groq is kept only as an automatic severity fallback and as the sole engine
for duplicate/correlation detection (which the new service doesn't cover at all). Non-negotiable
#4 reworded accordingly — "only caller of Groq" was never accurate for a two-provider world.

**Schema**: `Incident` gained 8 new, all-nullable risk-factor fields (`financialExposureNgn`,
`customerImpactCount`, `ongoingThreat`, `insiderInvolvement`, `dataCompromise`,
`regulatoryRelevance`, `channel`, `reportedByType` — migration `20261111191838_incident_ai_risk_
factors`) — the structured facts the severity model needs that nothing in EFIMS captured before.
Captured once (new `PATCH /incidents/:id/risk-factors` route) rather than re-entered on every
suggestion request.

**`ml-gateway`**: new `ml-service-client.ts` (plain `fetch`, 5s timeout, typed against the
vendor's exact JSON shapes) alongside the existing Groq (`openai` SDK) client.
`MlGatewayService.suggestSeverity` is now an orchestrator — tries the structured model first
(skips straight to Groq if any risk-factor field is missing, rather than sending fabricated
defaults), falls back to Groq only on unreachability (a 422 — our own mapping bug — surfaces as a
400 instead, deliberately not swallowed by the fallback). Response carries `source: 'structured-
ml' | 'groq-fallback'` so an analyst always knows which engine answered. Two new pass-through
capabilities, no Groq equivalent for either: `scoreAnomaly` (new `MlGatewayController`, `POST
/ml-gateway/anomaly/score`, not case-scoped — a standalone investigative tool, audited as
`entityType: 'AdHocQuery'`) and `predictRecovery` (new `RecoveryService.predictRecovery`, `POST
/cases/:caseId/recovery/predict` — derives `gross_actual_loss_ngn`/`containment_confirmed` from
real case data rather than trusting client input, takes the four fields EFIMS doesn't model
—severity/fraud_type/channel/days_to_detection — from the request).

**Carried over verbatim from the vendor's own documentation**, per this project's standing rule to
never represent a capability as more reliable than its own docs say: trained on synthetic data,
not for real case decisions yet; severity S1 has only 3 training examples; recovery's
cross-validated ROC-AUC is 0.627; fairness checks are inconclusive.

**Mock server for verification**: this session doesn't have the ML dev's actual Python project,
only the reference document — a throwaway local mock implementing the exact documented contract
(including 422/503/500 cases) was used to verify the integration end-to-end; the real service,
once running, needs no code change on this side since the client is built against the documented
contract, not the mock.

**Open items sent back to the ML dev**: field-mapping gaps (`channel`/`reported_by_type` are new
EFIMS fields with no prior canonical values; `incident_type`/`source` don't share a vocabulary
with the vendor's fixed lists); clarified that CORS is the wrong control for a server-to-server
integration (EFIMS never calls this from the browser) — a network-level allow-list is what
actually matters once this is reachable beyond localhost; asked about the auth header format,
the feedback-loop mechanism for analyst accept/override decisions, and confirmation of a real
Docker build before relying on one for deployment.

Full task list and verification detail: see this session's plan file / PR description.

---

## 2026-11-11 — Hybrid design pass (Contra/SimpliRisk-inspired), 7 phases

User shared Contra/SimpliRisk screenshots plus `EFIMS_Hybrid_Design_Spec.md` and an update-
instructions document scripting a "Step 0: report, then wait" reconciliation. Unlike the earlier
TanStack/Emerald-Porcelain documents (rejected 2026-10-14), this one is explicitly additive — same
stack, same sidebar/routes, same Botanical/Vanguard identity, layering patterns inside existing
pages. Did a real Step-0 audit (3 parallel research passes) rather than guessing, surfaced several
places the spec's own assumptions didn't match the real app (no single shared "Overview" page —
`/` is a 20-role dispatcher; no case-level SLA clock, only one per incident; a generic "mark task
done" button is unsafe for 3 of 4 candidate source entities), and got 3 explicit scoping decisions
from the user before writing any code: build a real `Task` entity (not a pure synthesized view);
don't refactor the 20 role dashboards into the spec's 8 shared archetypes this pass; finish the
already-in-flight register-pages work first.

**Phase 1** — carried forward the prior plan's still-open sidenav restructure (exact Monitor/
Manage/Govern grouping the user confirmed) and Settings consolidation (`/settings/integrations`,
an honest "not connected" status page per source system; `/settings/retention`, a real register of
legal-hold evidence + a read-only CD-05 summary). New `/intake` page renders the *existing*
`/signals`/`/incidents` page content as tab panels by exporting each page's body as a named
`*PageContent` function and giving each `page.tsx` a thin default-export wrapper — no
data-fetching duplicated, `/signals`/`/incidents` keep working unchanged for deep links.

**Phase 2** — new `Task` Prisma model + `src/modules/tasks/` (migration `20261110161528_tasks`,
RLS policy added to `rls-policies.sql`). Deliberately NOT a parallel mutable copy of `CapaAction`/
`InvestigationIssue`/`ApprovalRequest`/`ContainmentRequest`'s own lifecycles — those four each have
real business rules (CD-04 gates, segregation of duties, confirmation-gating) a generic "mark
done" action must never bypass. `Task` only persists freestanding to-dos; `TasksService.listAll`
is the cross-case register for those. New `TASK_ASSIGNED_EVENT` wired into `NotificationsService`
exactly like `APPROVAL_REQUESTED_EVENT`'s precedent — confirmed live, a real notification arrived
for a different user on task creation, not just self-assignment.

**Phase 3** — `/cases` gained a Cases | Tasks tab pair (reusing `/referrals`'s own Link+searchParam
tab pattern). The Tasks tab is a **union**, not a single source: real `Task` rows plus read-derived
rows from CAPA (open/in-progress), approvals (pending), and containment (requested) — each
derived row's "open" action always routes to the real case-detail tab, never a generic complete
button. `InvestigationIssue` excluded from v1 (no cross-case register endpoint for it yet,
genuinely least task-shaped of the four — no owner, no due date) — a stated fast-follow, not a
silent gap. Mine/Overdue/All filters only — dropped the spec's "team"/"blocked" filter ideas since
neither concept exists anywhere in this codebase (would've been dead controls).

**Phase 4** — case-detail right rail (`cases/[id]/right-rail.tsx`), `layout.tsx`'s `{children}`
slot wrapped in a `grid-cols-[1fr_320px]` with the rail as a sibling column — no change needed to
any of the 7 tab pages' own internal grids. Linked-incident SLA panel reuses the existing
per-incident `getCurrentSlaClock` (no case-level clock was invented); `CasesService.getSummary`
extended to return actual linked-incident ids/reference codes, not just a count. "Recent activity"
deliberately left out: the only candidate filter (`GET /audit-events?entityId=`) only matches
direct Case-entity events, not the richer CAPA/approval/evidence activity a reader would expect —
shipping a misleadingly partial feed would be worse than omitting it.

**Phase 5** — Executive dashboard only gained Operations | Analytics tabs (first real consumer of
the installed-but-unused shadcn `Tabs` primitive) — the other 16 `QueueDashboard`-driven roles
don't, per the "no dashboard consolidation this pass" decision and the spec's own "no dead
controls" rule (a population-level Analytics tab on a single-role queue view would be exactly
that). Analytics tab keeps the existing severity-trend chart and adds a second real chart
(`components/charts/recovery-bar-chart.tsx`, Recharts `BarChart`) — verified loss vs. reconciled
recovery per case, fed entirely by the already-shipped `/recovery` register endpoint, no new
backend stats route needed.

**Phase 6** — small, representative color-token touch-up (`audit/page.tsx`, `cases/page.tsx`):
swapped `text-primary` to neutral `text-on-surface` on the two KPI sub-stats that render a status
count (Audit's SUCCESS count, Cases' CLOSED count) rather than a genuine headline total. Audit
itself came back clean: `status-badge.tsx` already routes "positive" through a separate `tertiary`
token, never `primary` — the brand-color-means-status risk the spec worried about mostly wasn't
real here.

**Phase 7** — `/configuration/[key]` gained Baseline | Proposed amendment | Comparison | History
tabs (baseline = latest RATIFIED history entry if any; proposed amendment = current DRAFT if one
exists; comparison = a plain key-by-key diff of the two `value` objects) plus a persistent
"Unratified — working default only" badge, confirmed live on CD_02 (not yet ratified for this
tenant). New site-wide `UnratifiedConfigurationBanner` in `(app)/layout.tsx`, shown to every
authenticated role (not just Configuration roles) while any of CD-01–08 is unratified — directly
reinforces non-negotiable #9 instead of only stating it in docs.

**Verification**: tsc/lint clean on both apps after every phase. Live-verified via several
Playwright passes against the real running dev servers (never restarted mid-test except once,
deliberately, after both genuinely crashed — see below): all 17 sidenav routes, the Tasks tab's
merge/filters/inline complete action (confirmed a real backend round-trip, not just local state),
the right rail on cases with and without linked incidents, the Executive Analytics tab vs. a
QueueDashboard role's unchanged dashboard, the color swap via computed styles, and the CD-02
unratified badge. One real environment incident along the way: both dev servers crashed mid-session
(`EADDRINUSE` in the backend log, consistent with many rapid `nest start --watch` recompiles under
heavy concurrent file edits) — restarted once, confirmed healthy, not a code defect. Two apparent
test failures during the final pass were both test-script bugs, not app bugs: a `networkidle`
wait condition that doesn't fit a page with a live Socket.IO connection (fixed by re-checking with
`waitUntil: 'load'` — `/audit` loads in ~12s, just slow, zero console errors), and a case-link
selector that matched the "New case" button's `/cases/new` href instead of a real case id (the
"UUID is expected" errors it produced were the correct, expected validation response, not a bug).

**Next**: `InvestigationIssue` in the Tasks union once a cross-case register exists for it; the
full states/accessibility pass (empty/loading/forbidden/conflict/offline/read-only across every
view) stays explicitly deferred as its own cross-cutting pass, not scattered across this one; the
2026-11-02 production-readiness backlog (automated tests, `ml-gateway`'s existence now closes one
item but most of that list is untouched) is still the real next priority whenever the user picks it.

---

## 2026-11-10 — design system blend ("Botanical Precision") + the first real `ml-gateway`

User pushed back hard on the 2026-11-02 audit's framing: unconvinced the product actually solves
the problem it's named for ("Financial Crime **Intelligence** & Incident Management System" with
zero AI anywhere), and dissatisfied with the design on three specific counts — doesn't read as
"intelligence" (every page a form + a table), the information architecture feels flat, and the
visual polish isn't there. Research confirmed concretely: 16 of 20 role dashboards share one
identical KPI-row-plus-table shell, no charting library existed anywhere in `package.json`, no
cross-entity search existed anywhere in the app, and — a real bug, not a style complaint — the
implemented severity tokens had S2 and S3 defined as the literal same color (`#f59e0b`). A second,
fully-specified design system, **"EFIMS Vanguard Precision"** (`mockups/design-tokens/
efims-vanguard-precision.md`), already existed — built for exactly this forensic/analyst feel
(Linear/Stripe engineering precision + Palantir Gotham/ServiceNow density) but superseded early in
the project before most pages were built. Shown side-by-side against the shipped "Botanical
Executive" on a real case page; user chose to blend the two rather than adopt either wholesale.

**Design: "Botanical Precision" token blend** (`efims-frontend/src/app/globals.css`) — Vanguard's
cooler slate surface scale replaces Botanical's warm porcelain-cream, Botanical's spruce-green
(`#072320`) is kept as the one warm primary accent, secondary/tertiary move to Vanguard's cooler
slate/blue pairing, elevation shadows retint from green to neutral slate. Playfair Display
headlines are kept (explicitly not swapped to Inter). Severity tokens adopt Vanguard's 4 distinct
colors verbatim, fixing the S2/S3 collision as part of the token swap rather than a one-line patch.
Shape-language policy documented: `rounded-full` reserved for status badges only, going forward.

**Structural additions, all new, none existed before**:
- **Global Ctrl+K search** (`components/shell/command-palette.tsx` + `app/api/search/route.ts`) —
  fans out to the cases/incidents/signals list endpoints' existing `q` filter plus a `GET /users`
  substring match; no new search index, reuses what's there.
- **First real charts** (`components/charts/trend-chart.tsx`, `recharts`) — an outcome trend on the
  Audit page and a severity trend on the Executive dashboard. Both needed small new backend
  time-series endpoints (`GET /audit-events/trend`, `GET /triage/severity-trend`) since the
  existing `*/stats` endpoints are point-in-time snapshots, not day-grouped series. The severity
  trend read `TriageAssessment` — caught and fixed a real non-negotiable-#2 violation before it
  shipped: this was first written directly inside `IncidentsService`, which doesn't own that
  table; moved to `TriageService` (which already depends on `IncidentsService` for visibility,
  never the reverse) using a new `IncidentsService.getVisibleIncidentIds` cross-module read,
  mirroring `CasesService.getVisibleCaseIds`'s established pattern.
- **Detail drawer** (`components/shell/detail-drawer.tsx`) — scoped to Cases only, per the plan.
  Clicking a row opens a quick-preview slide-over using data already in the list response (no
  extra fetch); "Open full case" still goes to the real `/cases/[id]` route, which is unchanged.
- Dense table/mono treatment: `components/ui/table.tsx` tightened to Vanguard's 36/40px row-height
  spec, new `components/ui/mono.tsx` for forensic identifiers (case/incident ids, hashes,
  timestamps), applied to Audit and Cases as the representative pass — not every page.

**The first real `ml-gateway`** (`efims-backend/src/modules/ml-gateway/`) — the module CLAUDE.md
has named as the system's sole AI entry point since the beginning, never built until now. Builds
exactly CD-08 Phase 2 (`docs/configuration-decisions.md`), nothing further up that roadmap:
- `MlGatewayService` — the only caller of Groq anywhere in the codebase (non-negotiable #4),
  using the `openai` SDK pointed at Groq's own base URL (Groq's API is OpenAI-compatible). Fails
  gracefully (503, not a crash) when `GROQ_API_KEY` isn't configured — confirmed live.
- **Severity suggestion** (`GET /incidents/:id/triage/suggestion`) — advisory-only, read-only,
  never writes a `TriageAssessment`. Surfaced on the incident page as a "Get AI suggestion" button
  the human opts into (not an automatic page-load call — it's a real external API call with real
  latency/cost), shown beside the human's own severity picker, never prefilling it.
- **Duplicate/correlation detection** (`GET /incidents/:id/similar`) — same advisory posture,
  candidate set is this actor's own compartment-filtered visible incidents in the same category.
  Wires to the already-existing, already-tested `relate`/`merge` actions — only the "find and
  score" step is new.
- Both capabilities were a genuine architectural near-miss, caught and corrected before shipping
  (see above) — a concrete demonstration of why non-negotiable #2 matters in practice, not just
  in principle.

**Explicitly out of scope, confirmed real gaps, correctly deferred**: the much larger "intelligence"
mockups (`network-graph`, `entity-risk-scoring-watchlist`, `customer-360-entity-profile`,
`alert-rule-engine`) all need entirely new domain models (Customer/Account/Transaction/Entity)
that don't exist anywhere in the schema — genuine multi-week undertakings, not a slice of this
pass. CD-08 Phase 3+ (narrative generation, anomaly detection, case summarization) is not
attempted. The mechanical density/mono roll-out across every remaining list page (Signals,
Incidents, all 20 role dashboards) is not exhaustive — Audit, Cases, and the Executive dashboard
are the representative pass; the rest inherit the new color tokens automatically (CSS variables)
but not yet the literal density/mono/radius class changes.

**Verification**: `npx tsc --noEmit` + lint clean on both apps throughout. Live-verified: the token
blend screenshot-confirmed correct, Ctrl+K search (button and real keyboard shortcut) returning
real results, both new charts rendering, the Cases drawer opening/closing correctly, both new
ml-gateway endpoints degrading to a clean 503 (not a crash) with `GROQ_API_KEY` unset and the
frontend panels surfacing that gracefully. Full regression — the complete admin-driven
signal-to-users flow — re-run twice (once catching a test-script selector bug of its own, not an
app bug), passing all 20 steps with zero console errors on the final run.

---

## 2026-11-10 (cont'd) — real Groq key wired in, two real bugs found and fixed

User supplied a real `GROQ_API_KEY`. Verifying the two ml-gateway capabilities against it (not
just their configured-vs-not-configured code paths, which were all that could be confirmed above)
surfaced two real bugs, both fixed and re-verified live:

- **Wrong model name.** `GROQ_MODEL` was hardcoded to `llama-3.3-70b-versatile`, which Groq has
  since removed from its catalog — both endpoints 500'd with "The model ... does not exist."
  Queried Groq's own `/v1/models` list with the real key to find what's actually servable today;
  switched to `openai/gpt-oss-120b` in `efims-backend/.env` and `.env.example`. Both endpoints then
  returned real, sane output: a severity suggestion of S4/92% confidence for a test incident with
  no realized loss (correctly low per CD-02), and a similarity scan correctly scoring near-duplicate
  test incidents at 0.99 against 0.40–0.55 for same-category-only matches. This is the kind of gap
  that CLAUDE.md's own working agreement exists to catch early — a model name silently going stale
  underneath a feature that had only ever been tested against its own 503 fallback path.
- **`SimilarIncidentsPanel`'s inline Relate/Merge could get stuck disabled forever even though the
  backend write had already succeeded.** Root cause: `act()` called the existing
  `relateIncidentsAction`/`mergeIncidentAction` Server Actions (which call `revalidatePath`
  internally) and then tried to locally `.filter()` the acted-on candidate out of client state —
  but a Server Action invoked directly from a Client Component (not via `<form>`) races its own
  `revalidatePath` against that local state update, and the local update could get lost even
  though the backend call returned 200. Symptom: the button stayed disabled indefinitely, with no
  console error, misleading a human reviewer into thinking the action hadn't registered when it
  actually had. Fixed in `efims-frontend/src/app/(app)/incidents/[id]/similar-incidents-panel.tsx`
  by re-fetching the similarity list from the backend after the action settles (in a `finally`)
  instead of trusting local filter state — slower (the full list now re-scores via Groq again,
  ~15–20s combined), but correct and self-healing regardless of the race, which matters more for
  an advisory surface a human is relying on to reflect real state.

**Verification**: direct backend calls confirmed real Groq JSON for both endpoints; a live browser
pass confirmed the severity-suggestion panel renders real output (~5–9s latency, never prefilling
the human's own picker) and the similarity panel renders real scored candidates with working
inline Relate/Merge, re-tested specifically against the race above until it settled cleanly with
zero stuck buttons across repeated runs. `npx tsc --noEmit` and `eslint` (whole `src/`, zero
warnings) both clean on the frontend after the fix.

---

## 2026-11-02 — production-readiness audit + security patches

User asked for a full production-readiness gap analysis ("what do we still need for this to work
end-to-end for full production grade"). Three parallel research passes audited backend, frontend,
and infra/compliance with concrete file-level evidence rather than a generic checklist. Full gap
list (blocking vs. high-priority vs. explicitly-deferred-per-architecture.md §6) was presented to
the user; **user chose to start with security patches only** — the rest (automated test
infrastructure, a real deployment pipeline, structured logging/APM, CD-01..08 ratification, legal/
compliance docs, MFA, tenant billing/offboarding, and the backend's NestJS 10→12 major upgrade) are
confirmed gaps but **deliberately not started**, pending the user's own prioritization.

**Headline findings, for reference** (not yet acted on except where noted below):
- Zero automated tests in either app — every "live-verified" claim in this project's history was a
  manual Playwright/curl script run from a scratch folder, never committed. Confirmed independently
  by both audits; the frontend's own README already admits this.
- `ml-gateway` does not exist — `CLAUDE.md`'s "AI: Groq, called only through ml-gateway" is
  aspirational; no such module exists anywhere in `efims-backend/src/`, and notification "external
  delivery" is a stubbed no-op.
- No deployment runbook, `Dockerfile`, `render.yaml`, or CI/CD anywhere, despite being described as
  "deployed to Render."
- All 8 Configuration Decisions remain unratified drafts (confirmed against
  `docs/configuration-decisions.md`'s own ownership/ratification tracker) — none can be represented
  to a bank or regulator as final policy yet.
- The in-memory cache, rate limiter, and `@Cron` jobs are all single-instance-only — a real
  correctness bug (stale config across instances, duplicate SLA-breach runs, non-shared rate
  limits) the moment a second backend instance is added; currently masked only because deployment
  is explicitly single-instance today.
- No regulator-grade audit export (API-only, capped at 200 rows), no legal/compliance docs
  (privacy policy, ToS, DPA/GDPR/NDPA material), no backup/DR operationalization beyond CD-05/
  CD-07's paper policy, no incident-response runbook for EFIMS itself, no tenant billing/
  offboarding/data-export flow.
- ~27 of 35 `mockups/screens/*.html` references have no corresponding page (MFA, whistleblower
  portal, network graph, STR form generator, alert rule engine, and others) — some may be
  deliberately out of MVP scope, not yet confirmed one by one.

**Security patches applied this pass:**
- **Frontend dependency vulnerabilities**: `npm audit` showed 18 production-path vulnerabilities,
  including a **critical unauthenticated RCE in Next.js** (16.0.0–16.4.0 range). Root cause for
  most of the noise: `shadcn` (a dev-time CLI scaffolding tool, never imported at runtime) was
  listed in `dependencies` instead of `devDependencies`, pulling its whole MCP/`ts-morph`/build-tool
  dependency tree into the production audit scope. Fixed: moved `shadcn` to `devDependencies`,
  upgraded `next` 16.3.6 → 16.4.3 (fixes the RCE) and `zod` ^4.6.5 → ^4.6.7, then
  `npm audit fix` for the rest. **Result: 0 production-path vulnerabilities** (was 18, including
  the 1 critical). Verified: clean `tsc`/`lint`, and a full `next build` succeeds with the upgraded
  Next.js.
- **Backend dependency vulnerabilities**: `npm audit fix` resolved the one critical finding
  (`handlebars`, a transitive dependency of `@nestjs/cli` — build-time only, never shipped in the
  compiled `dist/` output). The remaining 17 production-path findings all require a NestJS 10→12
  major-version bump across nearly every `@nestjs/*` package simultaneously — **deliberately not
  attempted in this pass**: for a financial-crime system this is a real framework migration
  deserving its own dedicated upgrade + full regression pass, not something to bundle into a
  routine patch sweep.
- **Login brute-force protection**: the global `ThrottlerModule` config
  (`efims-backend/src/app.module.ts`) had a comment claiming "a stricter [limit] on `/auth/login`
  use[s] `@Throttle()` where they're added" — but `@Throttle()` was never actually used anywhere.
  Added a real 5-requests-per-60-seconds override on both `POST /auth/login` (tenant users) and
  `POST /platform/auth/login` (cross-tenant super-admin, at least as high-value a target).
  Live-verified: the 6th login attempt within the window correctly returns `429`, and a legitimate
  login succeeds normally once the window clears.
- **Stale doc comment**: `efims-frontend/src/components/dashboards/admin-dashboard.tsx` still said
  "no frontend form yet" for user management — stale since the `/users` section shipped in the
  2026-10-29 entry below. Updated the comment and replaced the dead "Provisioning" info card with a
  real link to `/users/new`.

**Verification**: `npx tsc --noEmit` + lint clean on both apps; a full `next build` production
build succeeds; the login throttle live-tested end-to-end (blocks at 6 attempts/60s, resets
correctly); the full admin-driven end-to-end regression script re-run after all changes — all 20
steps pass, zero console errors.

---

## 2026-10-29 — three deferred follow-ups shipped: live notifications, user-management UI, inline form validation

`CLAUDE.md`'s own status section had three items explicitly marked "not started, don't start
unprompted": real-time Socket.IO push on the `notifications` page, a user-management UI
(`POST /users` and the whole maker-checker access-change flow had no frontend), and inline
per-form validation beyond the single shared `(app)/error.tsx` boundary. User hit two real bugs
while validating a signal this session (a free-text taxonomy field with no indication of valid
values, then a controlled/uncontrolled `Select` warning from fixing the first one), asked to
"revalidate end-to-end," and scoped it via explicit choice to building these three specific
deferred items, planned first.

**Signal-validate bugs fixed first** (`efims-frontend/src/app/(app)/signals/[id]/`): the
`category`/`type` fields in `validate-form.tsx` were plain free-text inputs with no connection to
the real CD-01 taxonomy — "Theft" was rejected with no indication of what the valid categories
even were. Fixed by fetching the real, current CD-01 taxonomy server-side in `page.tsx` (only for
roles that can actually triage) and rendering `category` as a dropdown with a dependent `type`
dropdown scoped to the chosen category. Separately, `GET /signals/:id` is intentionally open to
any authenticated role, but validate/reject is not — an `INCIDENT_REPORTER` viewing their own
submitted signal could see and submit the validate form, only to get a confusing post-submit 403;
fixed by gating the form's visibility client-side on a `TRIAGE_ROLES` list mirroring the backend's
own constant. Fixing the taxonomy dropdown then surfaced a genuine React bug: initializing the
category `Select`'s state as `useState<string | undefined>(undefined)` made it render uncontrolled
on first paint and controlled the instant something was selected — Base UI correctly flagged this.
Fixed by initializing to `""` instead, so the controlled prop is never literally `undefined`.

**Real-time notifications** — the backend needed no changes: its JWT-authenticated realtime
gateway (`efims-backend/src/infrastructure/realtime/`) already pushed `notification.created` to a
user's own room on every notification-creating domain event; the frontend simply never connected.
Added `socket.io-client` as a real dependency, a new `NEXT_PUBLIC_REALTIME_URL` env var (the one
deliberate exception to "the browser never talks to the backend directly" — a long-lived push
channel can't be proxied through a stateless Server Action the way REST calls are), a new Route
Handler (`src/app/api/realtime-token/route.ts`) that hands the existing short-lived access token to
client JS since the session cookie is httpOnly, and a shared `useRealtimeNotifications` hook used
independently by both the notifications page's list and the topnav bell badge (each a thin client
wrapper around the existing server-rendered initial data, so first paint is unchanged). Verified
live: a notification fired from a separate session arrives in an already-open browser tab with zero
reload, both in the list and the badge count.

**User-management UI** — backend was already fully built (`POST /users`, and the maker-checker
`AccessChangeRequest` flow for role/compartment changes — there is deliberately no direct,
unmediated endpoint to change a role or grant/revoke a compartment, only the request/decide pair),
but had zero frontend. Added a full `/users` section: list, create, a per-user detail page with a
request-access-change form and inline approve/reject (hidden for the requester's own pending
requests, mirroring the backend's self-decision block), and a tenant-wide pending-requests inbox.
Gated to `ADMIN` in the sidenav, consistent with the backend's own `ADMIN`-only gate on every
mutating route here.

**Inline per-field validation** — a working pattern already existed in exactly 3 places (the two
login forms and tenant creation: Zod `safeParse` → `fieldErrors` + try/catch → `useActionState`),
but every data-entry form elsewhere still void-returned and let a thrown `ApiError` fall through to
the shared error boundary. Added one shared parser (`src/lib/form-state.ts`) that turns a backend
`ApiError` into field-level errors — the backend's `ValidationPipe` has no custom
`exceptionFactory`, so class-validator's default `"<property> <constraint text>"` messages are
exactly what's needed, no backend change required. Migrated every data-entry form in the app to
this pattern: all new user-management forms, signals (create/validate/reject), case creation, and
every case-detail tab (approvals, investigations, evidence, recovery, capa, regulatory,
containment), plus the configuration draft/ratify forms. Each conversion followed the same shape —
action returns `FormState` instead of `void`, form switches to `useActionState` — so a backend
rejection (duplicate email, the CAPA self-validation block, the approval segregation-of-duties
rule, a bad taxonomy category) now renders inline instead of hitting the generic boundary.

**Verification**: `npx tsc --noEmit` + `npm run lint` clean after each part. Live Playwright
verification of all three parts together — realtime push arriving with no reload, the full
maker-checker flow (create a second admin, request a role change, confirm self-decision is hidden,
log in as a different admin, approve it), and inline field errors rendering for a duplicate email
and an invalid signal field. Final regression: re-ran the full admin-driven end-to-end script
(signal → incident → triage → SLA → case → flag → approvals → investigations → evidence → recovery
→ capa → regulatory → containment → audit → configuration → notifications → users) — all 20 steps
pass, zero console errors, confirming the extensive form migration didn't regress anything already
verified.

---

## 2026-10-14 — 20-role RBAC expansion (per-tenant) + new platform/super-admin layer (cross-tenant)

User supplied an external "EFIMS Complete Claude Build Brief" written against a different stack
(TanStack Start/Vite/React Router) describing a richer ~20-role authorization model, per-role
dashboards, a Monitor/Manage/Govern nav grouping, temporary/expiring grants, and maker-checker for
access changes. Confirmed scope with the user before touching anything: **keep the real stack and
"Botanical Executive" design system entirely untouched; adapt only the role/dashboard/permission
ideas into the existing Next.js/NestJS/Postgres architecture; do the full 20-role matrix in one
pass** (not phased). Mid-pass, reviewing whether to narrow `ADMIN`'s existing blanket bypass per
the brief's "no default business-content access for admins" principle, the user asked for a
genuine cross-tenant `SUPER_ADMIN` layer instead ("we are going to be having multi-tenant
system") — a second, architecturally distinct piece of work, confirmed as **a new platform layer,
not a renamed `ADMIN`**, with real tenant provisioning built now rather than deferred. Both parts
below.

**Part A — per-tenant `Role` enum expanded 8 → 20 values** (`efims-backend/prisma/schema.prisma`).
Stays a flat scalar enum on `User`, not a many-to-many Role/Permission model — that generalization
is the schema's own documented future seam, not attempted this pass. New roles: `INCIDENT_REPORTER`,
`TRIAGE_ANALYST`, `EVIDENCE_CUSTODIAN`, `SECURITY_ANALYST`, `OPERATIONS_OFFICER`,
`RECOVERY_OFFICER`, `CONTROL_OWNER`, `EFFECTIVENESS_REVIEWER`, `HR_REVIEWER`,
`PROTECTED_DISCLOSURE_OFFICER`, `CONFIG_ADMIN`, `AUDITOR` (existing: `CASE_OWNER`, `INVESTIGATOR`,
`TEAM_LEAD`, `FRAUD_RISK_MANAGER`, `COMPLIANCE_MLRO`, `LEGAL_COUNSEL`, `EXECUTIVE`, `ADMIN`
unchanged). `Compartment` already covered every compartment the brief asked for — no new values
needed. Centralized 9x-duplicated role-list constants (`CASE_ROLES` etc., copy-pasted across
cases/evidence/containment/capa/regulatory/recovery/investigations/workflow/triage controllers)
into one `src/common/constants/roles.ts`, then extended each list with the roles above. Added new
cross-case "queue" endpoints (`GET /evidence/queue`, `GET /recovery/queue`,
`GET /capa/queue/owned`, `GET /capa/queue/validation`) so role dashboards have real tenant-wide,
access-filtered data — same pattern as the `*/stats` endpoints added in the 2026-09-30 density
pass. `UserCompartmentGrant` gained `expiresAt`/`revokedAt` (temporary/expiring grants — previously
absent); new `AccessChangeRequest` model + `AccessChangeService`/`AccessChangeController` for
maker-checker on role/compartment changes, reusing `ApprovalService`'s proven
requester-cannot-decide-own-request pattern rather than overloading the case-scoped
`ApprovalRequest` model (wrong shape — mandatory `caseId` FK). Seeded 19 new per-role users plus
the existing admin. Frontend: `Role` union expanded to match; `(app)/page.tsx` rewritten as a
per-role dashboard dispatcher (`lib/dashboard-loaders.ts`, 16 real backend-data-driven loaders +
a handful of bespoke dashboards for Executive/Reporter/Admin/Config Admin); sidenav rebuilt with
Monitor/Manage/Govern section grouping and per-item role filters.

**Scope decision, flagged rather than silently resolved**: tenant-scoped `ADMIN`'s existing
blanket bypass is unchanged this pass. The single seeded admin user is what every prior
verification pass in this project has relied on to drive every flow, and `Role` being scalar means
that user can't *also* hold a business role to keep that working. The user's actual concern — a
properly separate, more powerful administrative tier with no default business-content access — is
real, and now lives at the **platform** level (Part B), outside any tenant entirely, rather than as
a change to `ADMIN`'s behavior inside bank-1. Also out of scope this pass, flagged not dropped: a
generic capability/permission-string engine (stays flat-role-based), and access-recertification
campaigns (needs scheduling + campaign state — a separate feature, not a column addition).

**Part B — new platform/super-admin layer**, structurally separate from the tenant-scoped RBAC
system so a bug in one can't accidentally grant the other's power (a third boundary on top of
non-negotiable #5's "tenant isolation enforced twice"): new `PlatformUser` model
(`efims-backend/src/platform/`) — not a `Role` enum value, no `tenantId`, not RLS'd, alongside
`Tenant` as control-plane. Own JWT secret (`PLATFORM_JWT_SECRET`, separate from
`JWT_ACCESS_SECRET`), own guard (`PlatformAuthGuard`, populates `request.platformUser`, entirely
separate from `RolesGuard`), own login (`POST /platform/auth/login`, email+password, no tenant
slug). `TenantsAdminController`/`TenantsAdminService` — list all tenants with per-tenant case/user
counts (reuses `SlaClockService.sweepBreachedClocks()`'s established "list tenants directly, then
`withTenant(id, ...)` per tenant" cross-tenant pattern), provision a new tenant
(`POST /platform/tenants`), suspend/reactivate (`PATCH /platform/tenants/:id`). Extracted
`seed.ts`'s inline bank-1 bootstrap into one shared, plain (non-`@Injectable()`) function,
`provisionTenant()` (`src/platform/tenant-provisioning.ts`), callable from both the bare seed
script and a thin NestJS wrapper — no duplicated bootstrap logic between "the demo seed" and "a
real admin provisioning a bank." `rls-policies.sql`'s generic per-table-name RLS policies need no
changes for a new tenant — provisioning is genuinely just "insert a `Tenant` row + that tenant's
own CD-01..CD-08 defaults + first admin + a default team," already proven tractable by this
pattern. Frontend: new `/platform/login` + `/platform` (tenant list + create-tenant form),
deliberately a plain, visually distinct shell (no sidenav, no case/incident nav) so it's never
ambiguous which context you're in; separate `efims_platform_at` httpOnly cookie, no silent
refresh, `proxy.ts` branch scoped to the `/platform` path prefix only.

**Real bugs found live during this pass** (both caught by actually driving the UI/API, not static
checks):
- `CapaService.validate()` had no independence check — an action's own owner could validate their
  own work. Fixed by adding a self-validation block mirroring `ApprovalService.decide`'s existing
  segregation-of-duties pattern (audited DENIED, `ForbiddenException`).
- The create-tenant form's slug `<Input pattern="[a-z0-9-]+" />` threw a genuine browser console
  error under newer Chromium Unicode-mode character-class parsing (unescaped hyphen read
  ambiguously). Fixed to `pattern="[a-z0-9\-]+"`.

**Also found and fixed during final regression**: `CD_01_INCIDENT_TAXONOMY`'s "current" value had
been shadowed by an empty `categories: []` draft (version 2) left over from an earlier session's
CONFIG_ADMIN role-gate test — `ConfigurationService.getCurrent()`'s documented fallback
("highest-version RATIFIED, else highest-version DRAFT") correctly but unhelpfully picked that
empty draft over the real, never-ratified version 1. Not a code bug — stale test data. Fixed by
creating and ratifying a new draft (version 3) carrying the real taxonomy, restoring `getCurrent()`
to the correct value; left versions 1-2 in place (append-only, same principle as the 2026-09-30
audit hash-chain fix — history isn't rewritten even to clean up test data).

**Verification**: `npx tsc --noEmit` + `npm run lint` clean on both apps after each major step.
Live Playwright verification of a representative sample of new roles (dashboard renders with real
data, correct sidenav scoping, zero console errors) and the full platform flow (login → list →
provision a real second tenant → suspend → sign-out → session-cleared, zero console errors). Final
regression pass: re-ran the existing admin-driven end-to-end script (signal → incident → triage →
SLA clock → case → subject flag → approval request → self-approval correctly rejected →
investigations → evidence → recovery → CAPA/regulatory tabs → containment guard → audit →
configuration → notifications) against `bank-1` — all 19 steps pass, confirming nothing from this
session's schema/role/endpoint changes regressed the already-verified core flow.

---

## 2026-09-30 — `efims-frontend`: visual density pass (cases/incidents/signals/audit + case-detail tabs); pre-existing audit hash-chain bug found, root-caused, and fixed

- User feedback: the frontend built to this point was functionally complete but visually a plain
  MVP skeleton — nothing like the density/richness of the `mockups/screens/*.html` reference
  files (KPI hero rows, rich filter bars, dense table rows, tabbed case dossiers). Compared the
  actual `/cases` page against `mockups/screens/case-queue.html` directly to confirm the gap was
  real, then agreed scope with the user: bring cases up to mockup density first as a reviewable
  first pass (real data only, no fabricated KPI numbers — this project's standing rule), then
  once approved, apply the same treatment everywhere else on request ("apply all").
- **`cases` list** (`efims-frontend/src/app/(app)/cases/page.tsx`): 4-card KPI hero row (live
  caseload, financial scope, compliance risk / pending approvals, sensitivity), a real
  Compartment/Sensitivity-tier/search filter bar, richer table rows (linked-incident count,
  assigned-team name, sensitivity tier badge), working pagination, and a pending-approvals banner.
  Backend gained `GET /cases/stats` (tenant-wide, access-filtered summary — reuses the same
  7-condition filter `list()` already computed, refactored into a shared `getVisibleCases`
  helper) and `q`/`compartment`/`sensitivityLevel` filters on `GET /cases`. Deliberately dropped
  the mockup's fictional jurisdiction/payment-rail filters and Nigeria-specific regulatory banner
  copy — those don't correspond to any real field in this schema, and inventing them would violate
  the same "no fabricated data" rule as the CD-01 dashboard KPI fix documented below.
- **`incidents` list**: same KPI-row/filter-bar/table treatment, backed by a new
  `GET /incidents/stats`. Deliberately does **not** join severity/SLA-clock data into the list —
  `triage`/`workflow` both already depend on `IncidentsService` (see those services' own doc
  comments), so `IncidentsService` depending back on either for this enrichment would be a
  circular module dependency, not just inconvenient. Documented as a real follow-up rather than
  forcing the cycle.
- **`signals` list**: same treatment, backed by a new `GET /signals/stats` (`groupBy` on status,
  plus a whistleblower-source count).
- **`audit` trail**: exposed the filters `queryAuditEvents`'s API wrapper already supported but
  the page never surfaced (`entityType`, `action`, `from`, `to`), added a `GET /audit-events/stats`
  KPI row (SUCCESS/DENIED/FAILURE counts + the existing hash-chain-intact check, now shown as a
  hero card).
- **Case detail**: rebuilt `cases/[id]/layout.tsx` as a hero header (reference/sensitivity/
  compartment/status pills, title, description) plus a real 4-tile stats ribbon (outstanding
  exposure & recovered, from the existing per-case `recovery/summary` endpoint; linked-incident
  count and subject/conflict-flag count, from a new `GET /cases/:id/summary`) — and replaced the
  plain-text tab links with a Client Component (`case-tabs.tsx`, `usePathname()`) that actually
  highlights the active tab, which the old tab nav never did. Lightly restyled all 8 tabs
  (Overview, Approvals, Investigations, Evidence, Containment, Recovery, CAPA, Regulatory) for
  consistent card/icon/empty-state treatment; kept every test-relied-upon string (e.g.
  "Root cause", "New obligation", "request one on the Approvals tab first") unchanged so the
  existing Playwright verification script didn't need to change.
- Live-verified: the full 19-step end-to-end Playwright script (signal → incident → triage → SLA
  clock → case → flag → approval request/rejection → investigations/evidence/recovery/capa/
  regulatory/containment → audit → configuration → notifications) passes cleanly against the
  redesigned pages, zero console errors. Screenshots reviewed for every redesigned page.
- **Root-caused and fixed — a real bug, not tampering, and not the CD-01-script theory floated
  when this was first flagged.** Confirmed by direct reproduction (recomputing the stored event's
  hash both ways): `configuration.ratify` (`configuration.service.ts`) and
  `regulatory.obligation.create` (`regulatory.service.ts`) both put a live JS `Date` object
  straight into `metadata` (`effectiveDate`/`deadline`) instead of a pre-serialized string.
  `AuditService.record` hashes `metadata` at write time, before the Postgres JSONB round-trip —
  and `audit-hash.ts`'s `canonicalize()` had no special case for `Date`, so a `Date` instance
  (which has zero *own enumerable* properties) fell into the generic-object branch and hashed as
  the empty object `{}`. Every later `verifyChain` re-reads that same field back as a plain ISO
  string (what JSONB actually stored) and correctly canonicalizes *that* differently — a
  guaranteed, deterministic mismatch, confirmed by recomputing the stored hash with the
  `effectiveDate` field forced back into a `Date` object and getting an exact match.
  - **Fixed** in `canonicalize()` itself (`audit-hash.ts`), not by patching the two call sites —
    it's the one function both write-time hashing and verification share, so fixing it here
    covers every present and future caller that might put a `Date` in `metadata`, not just
    today's two. A `Date` now canonicalizes via `.toISOString()`, matching what `JSON.stringify`
    (and therefore the JSONB round-trip) already does with one.
  - **`AuditService.verifyChain` no longer stops at the first break.** It used to — meaning any
    breaks after the first were invisible. Now it resumes from each event's own stored hash after
    logging a break (same "treat this as a fresh segment" logic the pre-existing `hash === null`
    handling already used), so a single historical bug can't hide how many events it actually
    affected. Also now returns each break's action/entityType/entityId/createdAt/reason
    (`hash_mismatch` vs `link_mismatch`) instead of a bare event id — `efims-frontend`'s audit
    page renders these in a dedicated panel instead of a cryptic `#a06fc9cb`.
  - **The 3 already-written broken rows were deliberately left untouched** — running the fixed
    `verifyChain` end to end found exactly 3 breaks, all dated **2026-09-24** (one
    `configuration.ratify`, two `regulatory.obligation.create`), all fully explained by the same
    root cause, nothing unexplained left over. `audit_events` grants `REVOKE UPDATE, DELETE ...
    FROM efims_app` at the database level (`rls-policies.sql`) — belt-and-suspenders for
    non-negotiable #3 — so the app literally cannot rewrite them even in error, and rewriting
    audit rows to make a hash chain re-verify as "intact" (even to fix a genuine bug, even via a
    privileged connection) is indistinguishable in principle from rewriting them to hide real
    tampering. The correct "make correction" here is fixing the code so it can never happen
    again, not editing the ledger.
  - **Verified live**: created a fresh `regulatory.obligation.create` event through the now-fixed
    code path and re-ran `verifyChain` — the new event does not appear in `breaks` (confirmed by
    id), and the break count stayed at exactly 3 (the pre-existing ones), not 4.

---

## 2026-09-26 — `efims-frontend`: full module coverage built and live-verified; 3 real bugs found and fixed

- Expanded the frontend from the single `incidents` vertical slice to a real page for every
  remaining backend module, following the exact build-then-live-verify-in-a-browser pattern
  `incidents` established: `signals` (queue, intake form, detail + validate/reject — the actual
  intake surface upstream of `incidents`), `incidents` (extended with a detail page: triage
  assessment/escalation, SLA clock start/pause/resume/stop, relate/merge), `cases` (list, create,
  and a tabbed detail view — Overview, Approvals, Investigations, Evidence, Containment, Recovery,
  CAPA, Regulatory), `workflow` (approval request/approve/reject, surfaced inside the Approvals
  tab), `audit` (read-only trail — deliberately no `actions.ts`, matching non-negotiable #3), 
  `configuration` (read-only CD-01..CD-08 list + detail, matching non-negotiable #9), and
  `notifications` (list + mark-read; no live Socket.IO push wired into the page yet). Two small
  new feature modules exist purely to support these: `teams` and `users` (`GET /users` for
  name-lookup dropdowns and flag/assignment pickers).
- Sidenav extended to Dashboard/Signals/Incidents/Cases/Audit Trail/Configuration (the last
  role-gated to ADMIN/EXECUTIVE) — Investigations/Evidence/Containment/Recovery/CAPA/Regulatory
  are deliberately case-detail tabs, not top-level nav items, since none of them make sense
  outside a specific case's context. Topnav now shows a live unread-notification count.
- Added `(app)/error.tsx` (a shared Client Component error boundary covering every Server
  Action/Component under `(app)/`) and `(app)/loading.tsx` + `(app)/incidents/loading.tsx`
  (Skeleton-based loading states), and parallelized the dashboard's two sequential backend calls
  into `Promise.all`. `features/cases/get-case-cached.ts` wraps the case lookup in React's
  `cache()` so the case-detail layout and its 7 tab pages share one fetch per request.
- Backend gained 3 small endpoints purely to support this frontend surface (`efims-backend`):
  `GET /cases/:id/flags` and `GET /cases/:id/status-history` (`cases.controller.ts` —
  `getById` inside the service is still the real access check, no separate `@Roles()` gate, same
  pattern as every other read route), and `GET /users` (`users.controller.ts`, open to any
  authenticated user).
- **Four real bugs found live, all fixed** (full detail in `efims-frontend/README.md`'s "Real bugs
  this build found" section):
  1. Blank dashboard page — `(app)/page.tsx`'s two sequential uncached fetches plus zero loading
     UI meant the browser painted nothing during a normal (or occasionally slow, per this
     project's well-documented Neon-latency pattern) round trip. Fixed with `Promise.all` +
     `loading.tsx`.
  2. **Signal-validate redirected to the wrong id.** `SignalsService.validate()` (backend) returns
     the updated `Signal` row, not an `Incident` — the new/linked incident's id lives on that
     row's own `incidentId` field, `.id` is still the signal's id. `features/signals/api.ts`
     mistyped the response as `Incident`, and `features/signals/actions.ts` redirected to
     `/incidents/${incident.id}` — actually the signal's id. Every incident reached via signal
     validation 404'd, cascading into apparent triage/SLA/case-creation failures during
     verification (they were never actually broken). Fixed by correcting the return type to
     `Signal` and redirecting via `validated.incidentId`.
  3. Missing shared error boundary — an uncaught `ApiError` crashed the whole page with Next.js's
     raw dev overlay instead of a graceful message; fixed by adding `(app)/error.tsx`.
  4. (Pre-existing, re-confirmed) the CD-01 seed-data quality bug documented in the prior
     frontend-build entry below.
  - **Confirmed correct, not a bug**: the case-detail "add a subject/conflict flag" feature
    correctly locked the only seeded (admin) user out of a case once flagged as its `SUBJECT`,
    per non-negotiable #6 ("user not a subject/conflict on the case"). The fix was to the
    verification script (create a disposable second `INVESTIGATOR`-role test user directly
    against the backend, since there's no user-management UI yet), not the app.
- Live-verified end to end with a headless-Chromium (Playwright) script run from a scratch
  location outside this repo: one continuous flow — log a signal → validate into a new incident →
  triage assessment → start SLA clock → create a case → add a subject flag (on the dedicated test
  user, not the admin) → request a `CONTAINMENT` approval → self-approval correctly rejected
  (segregation of duties) → save an investigation plan → ingest evidence → record a recovery loss
  → CAPA/Regulatory tabs render → containment tab's "request one on the Approvals tab first" guard
  renders correctly (no approved request yet) → audit trail renders 50 real events →
  configuration list/detail render → notifications render. All 19 steps pass, zero browser console
  errors. Screenshots reviewed for design-token/layout correctness on the case-detail tabs.
- Updated `efims-frontend/README.md` (module status table, live-verified section, real-bugs
  section, "what's deliberately not here yet") and this project's root `CLAUDE.md` status section
  to match.

---

## 2026-09-26 — `efims-backend`: stale TypeScript incremental-build cache found and fixed structurally

- Real bug hit live, separate from the already-documented `nest start --watch` race: `npm run
  build` started exiting 0 with zero output and no `dist/` folder at all afterward. Root cause —
  `tsconfig.tsbuildinfo`/`tsconfig.build.tsbuildinfo` (`"incremental": true` in `tsconfig.json`)
  had recorded every source file as already compiled (by content hash), even though `dist/` had
  been deleted out from under that cache (by `nest-cli.json`'s own `deleteOutDir: true` on an
  interrupted/overlapping prior build). `tsc` wasn't lying — it genuinely believed there was
  nothing new to emit, so it emitted nothing.
- Fixed structurally, not just documented: added a `prebuild` script to `package.json` that
  deletes both `.tsbuildinfo` files before every `npm run build` (npm runs `prebuild`
  automatically ahead of `build`, no extra step for anyone running it). Verified live: deleted
  `dist/` again, ran `npm run build`, confirmed the `prebuild` step fired and `dist/main.js` was
  produced correctly.
- Documented in `efims-backend/README.md` alongside the existing `nest start --watch` gotcha note.

---

## 2026-09-26 — Frontend build started (`efims-frontend/`) — auth architecture, dashboard shell, `incidents` (first module)

- With the entire backend build order complete (2026-09-24 entries below), started frontend work
  per the confirmed toolset. Explicit instruction for this phase: keep it modular, prioritize
  security over speed where the two trade off (speed still matters, just second).
- **Scaffolded Next.js 16** (`create-next-app` — App Router, TypeScript, Tailwind v4, ESLint flat
  config), `npx shadcn@latest init` for shadcn/ui. Next.js 16 has real breaking changes from
  older versions (`middleware.ts` deprecated in favor of `proxy.ts`, fully-async `cookies()`/
  `headers()`/`params`/`searchParams`, Turbopack default) — the project's own generated
  `AGENTS.md` explicitly flags this and points at bundled, version-matched docs in
  `node_modules/next/dist/docs/`; read those (upgrade guide, `proxy` file convention,
  authentication guide, backend-for-frontend guide) before writing any code, rather than assuming
  prior Next.js familiarity still applied.
- **Security architecture — the browser never talks to the backend at all**: every backend call
  happens from this Next.js server (Server Components for reads, Server Actions for writes,
  never a Client Component). `BACKEND_URL` has no `NEXT_PUBLIC_` prefix and
  `src/lib/backend-client.ts` imports `server-only`, making it a build error (not just a
  convention) for the backend's origin to ever reach a client bundle — a step further than the
  confirmed toolset's own "REST only, no direct DB access" rule.
- **Session**: the backend's own signed JWTs are stored verbatim in two `HttpOnly`,
  `SameSite=Lax` cookies — deliberately not re-wrapped in a second encrypted app-level session
  token, since the backend already issues short-lived, signed, rotating tokens with reuse
  detection, and the cookies are already unreachable from client JS (the actual XSS mitigation).
  Decoded (never re-verified) JWT claims are used only for optimistic UI (role badge, nav
  gating) — the backend is the sole authorization authority on every real request, exactly as
  the rest of this project's non-negotiables already establish for every other caller.
- **Two-layer auth check**, matching the Next.js authentication guide's own recommended pattern:
  `src/proxy.ts` (optimistic, cookie-only redirect gate — deliberately self-contained, no shared
  imports from `src/features/`/`src/lib/`, per Next.js's own Proxy docs warning against relying
  on shared render-code modules; also does silent access-token refresh, since Proxy is the one
  place that runs before every navigation *and* can set cookies, unlike a Server Component) plus
  `requireSession()`/`getSession()` (the real DAL check, called in the dashboard layout and every
  page under it).
- **Design system**: Tailwind v4's `@theme` tokens in `globals.css` transcribed verbatim from
  `docs/design-system.md` v1.2.0's "Botanical Executive" palette (exact hex values), mapped onto
  both raw Material-3-style utility names (`bg-primary-container`, etc.) and shadcn/ui's own
  semantic slots, so every shadcn primitive already renders in-palette. `mockups/screens/*.html`
  used as layout/component reference per `mockups/README.md`'s own instruction, not copied
  verbatim — two deliberate departures, both because the real backend doesn't support what a
  mockup depicts: no FIDO2/YubiKey MFA on login (`identity` is single-factor; building a
  second-factor UI with nothing behind it would be security theater), no fabricated KPI numbers
  on the dashboard (every number comes from a real `GET /incidents` call's `total` field).
- **Modular structure**: mirrors the backend's own module boundaries —
  `src/features/<module>/` (one directory per backend module: `auth`, `incidents` so far; each
  holds hand-kept-in-sync `types.ts` + server-only `api.ts`), `src/lib/` (cross-module
  infrastructure), `src/components/shell/` (dashboard chrome, used only by the app layout).
- **First vertical-slice module: `incidents`** (list, `?status=` filter, pagination) —
  deliberately read-only, as the minimal slice proving the whole architecture (auth, session,
  styling, data fetching) end to end before adding real write actions.
- **A real, pre-existing data-quality bug found live** — not introduced by this session, but only
  surfaced once a real table actually rendered the data: the CD-01 taxonomy's "Whistleblowing"
  category had a `type` value of `"Whistleblower report (always WHISTLEBLOWING compartment,
  regardless of underlying subject matter)"` — CD-01's own explanatory note about how the
  category is *handled*, transcribed straight into the literal type-name string in
  `efims-backend/prisma/seed.ts` instead of staying a code comment. Undetected through every
  prior backend-only live-testing pass (nothing ever rendered it as a user-facing label);
  immediately obvious as wrong the moment the incidents table rendered it, clipping the table's
  last column in the process (a second, smaller layout bug, also fixed — the "Category / Type"
  cell had no width constraint). Fixed in the seed script (both the CD-01 config seed and the
  demo incident's own `type` field) and corrected directly in the already-seeded live rows (one
  `ConfigurationEntry.value` JSON field, one `Incident.type` field) via a one-off script against
  the privileged `DIRECT_URL` connection — the same "fix the live data, not just the code that
  will seed it next time" pattern used throughout this project.
- **Live-verified end to end**, driven by a headless-Chromium (Playwright) script against the
  real running backend, not just a description of expected behavior: unauthenticated `/` visit
  redirects to `/login`; login with the seeded admin sets session cookies and redirects to `/`;
  the dashboard renders real KPI numbers and the sidenav/topnav shell; the Incidents page renders
  real rows with correct compartment/status badges and (after the fix above) correct category/
  type strings; sign-out redirects to `/login`, and a subsequent `/` visit redirects back to
  `/login`, confirming the session was actually cleared server-side; zero browser console errors
  across the whole flow.
- **Verified**: `npx tsc --noEmit`, `npx eslint .`, and `npm run build` (Turbopack) all pass clean.
- **Documentation**: new `efims-frontend/README.md` (architecture, security model, design system,
  modular structure, live-verification specifics, what's deliberately not built yet). `CLAUDE.md`
  updated to reflect frontend work now underway.
- Next: continue one backend module at a time — `cases` next (and everything nested under it —
  `investigations`/`evidence`/`containment`/`recovery`/`capa`/`regulatory`), then `workflow`,
  `audit`, `notifications`, `configuration` — same build-then-live-verify-in-a-browser pattern.

---

## 2026-09-24 — `regulatory` module shipped — obligations register, submissions — **entire MVP backend build order now complete**

- Last module in the MVP build order, closing out the "full backend before frontend" request
  that drove this entire day's build sequence (cross-cutting infrastructure → `notifications` →
  `investigations` → `evidence` → `containment` → `recovery` → `capa` → `regulatory`):
  `regulatory` — architecture.md's "obligations register, submissions" — now built, migrated,
  RLS-applied, and live-verified. Every module `docs/architecture.md`'s module map names is now
  built.
- **Schema**: `RegulatoryObligation.deadline` is where CD-03's "statutory/regulatory deadlines
  are never paused by either calendar" is actually enforced — not by application logic checking
  a flag, but by the schema itself giving this field no pause/resume mechanism at all, unlike
  `SlaClock`. `RegulatoryObligation` mutates in place (`PENDING` → `SUBMITTED` →
  `ACKNOWLEDGED`, or `PENDING` → `WAIVED`); `RegulatorySubmission` is pure append-only, same
  posture as `WriteOffEntry`, with `approvalId` `@unique` from the start — the third module in a
  row (after `recovery`) to carry forward the reuse-prevention fix `containment` found as a real
  bug, never rediscovered.
- **Wires up CD-04's `REGULATORY_SUBMISSION` action for real**, the third and final of CD-04's
  four named actions this build sequence has now wired to an actual enforcement point
  (`containment` did `CONTAINMENT`, `recovery` did `LOSS_WRITE_OFF`; only `CASE_CLOSURE` predates
  this sequence, already wired by `cases` itself). `POST .../submit` requires `approvalId` to
  reference an `APPROVED` `ApprovalRequest` with `action = REGULATORY_SUBMISSION` for the same
  case, via the same reusable `ApprovalService.assertApproved` gate every CD-04-gated action in
  this codebase now shares.
- **Module boundary**: `RegulatoryModule` imports both `CasesModule` and `WorkflowModule`
  directly — identical one-directional leaf shape to `ContainmentModule`/`RecoveryModule`.
- **Live-verified end to end** against the real Neon database: the seeded obligation (already
  `ACKNOWLEDGED`) confirmed readable with its submission history included, a fresh `PENDING`
  obligation created, a submit attempt with a bogus `approvalId` rejected (400), one referencing
  a `CONTAINMENT` approval instead of `REGULATORY_SUBMISSION` rejected (400), reuse of an
  already-used `approvalId` rejected (400) — **correct on the very first live attempt, the third
  module running in a row where this exact bug class never reappeared** — a fresh
  `REGULATORY_SUBMISSION` approval requested and decided by an authorized `COMPLIANCE_MLRO`
  (confirming CD-04's S1/S2 matrix requires only *one* of `COMPLIANCE_MLRO`/`LEGAL_COUNSEL` to
  decide, not both — this codebase has no multi-signature approval concept, and this was the
  first live test to actually exercise a matrix entry naming two roles), submitted successfully,
  a second submit on the now-`SUBMITTED` obligation rejected (400), acknowledged successfully, a
  separate fresh obligation's premature acknowledge (while still `PENDING`) rejected (400), that
  obligation waived successfully, a submit attempt on the now-`WAIVED` obligation rejected (400),
  a wrong-case/obligation-id combination correctly 404ing, a user with no case access denied
  (403), and RLS tenant isolation reconfirmed directly against the database (an `efims_app`
  session with no tenant context set sees zero rows across `regulatory_obligations`/
  `regulatory_submissions`, despite real rows existing from this same test pass).
- Seed script extended with one `RegulatoryObligation` (`STR_SAR_FILING`, NFIU) taken through its
  full lifecycle to `ACKNOWLEDGED` in the seed data itself, following the same
  pre-walked-lifecycle pattern `capa`'s seed data established. Ran within the existing
  90-second transaction timeout without needing a further bump — it held for every module added
  after the original bump, through this, the last one in the build order.
- **Verified**: `npx tsc --noEmit` (main + seed project), `npx prisma validate`, `npm run build`
  (Nest CLI), and `npm run lint` all pass clean, first pass, no fixes needed.
- **Documentation updated same session, and consolidated**: `efims-backend/README.md` (new
  "Regulatory flow" section, "Built so far" summary now reads as complete, new "deliberately not
  here yet" bullets including the one still-open gap this module's own existence highlights —
  `SlaClock` still has no link to `RegulatoryObligation`, so a clock tracking a statutory deadline
  still has no way to mark itself un-pausable, even though the deadline stored directly on a
  `RegulatoryObligation` now correctly can't be). `CLAUDE.md`'s Status section was rewritten from
  eight separate per-module paragraphs into one consolidated summary now that the build-out this
  sequence tracked is actually finished, rather than appending a ninth paragraph to an
  ever-growing list.
- **What's next**: per the user's own explicit request ("the backend of every feature needed for
  a full production of this product" before frontend work starts), that condition is now met.
  The next phase is frontend work against the confirmed toolset (Next.js App Router + TypeScript
  + Tailwind + shadcn/ui), building against the REST API surface this backend now exposes end to
  end across all fourteen modules plus the cross-cutting infrastructure pass.

---

## 2026-09-24 — `capa` module shipped — root cause, actions, validation

- Continuation of the "full backend before frontend" build order, next module past `recovery`
  (same day's earlier entry): `capa` — architecture.md's "root cause, actions, validation" — now
  built, migrated, RLS-applied, and live-verified. Only `regulatory` remains after this.
- **Schema**: `RootCauseAnalysis` versioned/append-only like `InvestigationPlan` (a revised
  understanding of root cause is a new row, never a mutation). `CapaAction` mutates in place like
  `InvestigationIssue` (status transitions on the same row: `OPEN` → `IN_PROGRESS` →
  `COMPLETED` → `VALIDATED`, or `CANCELLED`). `CapaValidation` is pure append-only like
  `Interview`/`Finding`.
- **Deliberately no CD-04 approval gate** — the first module in this remaining-modules sequence
  to *not* reuse `ApprovalService.assertApproved`. CD-04's matrix names exactly four actions
  (Containment, Loss write-off, Regulatory submission, Case closure); CAPA isn't one of them, so
  wiring an approval requirement here would have been unrequested scope creep dressed up as
  faithfulness to the doc, not an oversight to fix. Documented explicitly in both the schema
  comment and `CapaService`'s own doc comment so it reads as a decision, not a gap.
- **A real, useful business rule, not just a status field**: `POST .../validate` only accepts a
  `COMPLETED` action (400 otherwise); an `EFFECTIVE` outcome moves it to `VALIDATED` (terminal),
  but `INEFFECTIVE`/`PARTIALLY_EFFECTIVE` reopens it to `IN_PROGRESS` — rework needed — rather
  than leaving a `COMPLETED` action sitting there with a validation outcome nobody acted on. This
  is the one place in this module where "validation" does more than record a fact; it drives the
  action's own state machine.
- **Module boundary**: `CapaModule` imports `CasesModule` (case access) and `IdentityModule`
  (`UsersService.assertUserExists`, validating a CAPA action's `ownerId` — the same
  `assertExists`-style cross-module validation `cases`' `assignedTeamId` already uses via
  `TeamsService`) directly.
- **Live-verified end to end** against the real Neon database: the seeded root cause and its
  already-`VALIDATED` action confirmed readable, a new action created with no `rootCauseId`
  (confirming that link is genuinely optional, not silently required), a premature validate
  attempt on a fresh `OPEN` action rejected (400), then the full lifecycle exercised for real —
  start → complete → **validate `INEFFECTIVE` → confirmed the action actually reopened to
  `IN_PROGRESS`** (via a `?status=IN_PROGRESS` filter, not just trusting the response body) →
  completed a second time → validated `EFFECTIVE` → reached `VALIDATED` — full 2-entry validation
  history returned in order, cancelling an already-`VALIDATED` (terminal) action rejected (400), a
  separate action created then successfully cancelled, a `rootCauseId` referencing a root cause
  on a *different* case rejected (400, the same cross-entity-validation pattern `investigations`'
  `Finding.resolvesIssueId` established), a user with no case access denied (403), and RLS tenant
  isolation reconfirmed directly against the database (an `efims_app` session with no tenant
  context set sees zero rows across `root_cause_analyses`/`capa_actions`/`capa_validations`,
  despite real rows existing from this same test pass).
- Seed script extended with one `RootCauseAnalysis` (v1, `FIVE_WHYS`) and one `CapaAction`
  (`PREVENTIVE`, SIM-swap alert auto-enrollment) taken all the way to `VALIDATED`/`EFFECTIVE` in
  the seed data itself — the first module's seed data to pre-walk an entity through its full
  status lifecycle rather than leaving it at a single fixed state. Ran within the existing
  90-second transaction timeout without needing a further bump.
- **Verified**: `npx tsc --noEmit` (main + seed project), `npx prisma validate`, `npm run build`
  (Nest CLI), and `npm run lint` all pass clean, first pass, no fixes needed.
- **Documentation updated same session**: `efims-backend/README.md` (new "CAPA flow" section,
  updated "Built so far" summary, new "deliberately not here yet" bullets, seed-step note),
  `CLAUDE.md` (Status section moves `capa` from "remaining" to "done", updated remaining-modules
  list — now naming only `regulatory`).
- Next: `regulatory` (obligations register, submissions) — the last remaining module per the
  build order. Once it ships, the entire backend the user asked to have production-ready before
  any frontend work starts is complete, and the next phase (per the user's own explicit request)
  is starting frontend work per the confirmed toolset (Next.js + TypeScript + Tailwind +
  shadcn/ui).

---

## 2026-09-24 — `recovery` module shipped — loss/recovery ledger, reconciliation

- Continuation of the "full backend before frontend" build order, next module past `containment`
  (same day's earlier entry): `recovery` — architecture.md's "loss/recovery ledger,
  reconciliation" — now built, migrated, RLS-applied, and live-verified.
- **Schema**: `LossEntry`/`RecoveryEntry` are pure append-only ledger rows (no update/delete
  path), same posture as `Interview`/`Finding` — a loss or recovery determination is a
  fact-of-record; correcting one means recording a new correcting entry, never mutating history.
  `WriteOffEntry.approvalId` is `@unique` from the start — the reuse-prevention fix `containment`
  had to find and fix live (see that entry above) was built into this module's very first version
  instead of being a second live-discovered bug. All amounts assume NGN, matching CD-02's
  `financialLossThresholdNgn`/CD-04's `amountBandsNgn` — this codebase's only currency precedent;
  mixed-currency aggregation is explicitly out of scope, documented as such, not mishandled
  silently.
- **Wires up CD-04's `LOSS_WRITE_OFF` action for real**, the second of the two approval actions
  every prior module's README flagged as "named by CD-04 but with nothing to attach to yet"
  (`containment` closed the first, `CONTAINMENT`, in the entry above): `POST .../write-offs`
  requires `approvalId` to reference an `APPROVED` `ApprovalRequest` with
  `action = LOSS_WRITE_OFF` for the same case, via the same reusable `ApprovalService.
  assertApproved` gate. Unlike a containment action, a write-off has no external system to wait
  on a confirmation from — it's an internal accounting action, final the moment it's recorded, so
  there's no `REQUESTED`/`CONFIRMED` status machine here, just an append-only ledger row.
- **"Reconciliation" is deliberately not a stored entity** — `GET .../summary` computes
  `totalLoss`/`totalRecovered`/`totalWrittenOff`/`outstanding` fresh from the ledger via
  `Prisma.aggregate` on every call, the same "derive, don't store a flag that can drift" posture
  `containment` already established for whether a case is "contained" (no boolean field there
  either).
- **Module boundary**: `RecoveryModule` imports both `CasesModule` and `WorkflowModule` directly
  — identical one-directional leaf shape to `ContainmentModule`.
- **Live-verified end to end** against the real Neon database: the seeded ledger's summary
  matched exactly (₦450,000 loss, ₦150,000 recovered via chargeback, ₦300,000 written off, ₦0
  outstanding), a new ₦5,000 fee loss recorded, a write-off attempt with a bogus `approvalId`
  rejected (400), one referencing a `CONTAINMENT` approval instead of `LOSS_WRITE_OFF` rejected
  (400) by the same `assertApproved` check, **reuse of an already-used `approvalId` correctly
  rejected on the very first live attempt** — confirming the `@unique`-from-the-start design
  actually works, not just compiles — a fresh `LOSS_WRITE_OFF` approval requested and decided by
  an authorized `FRAUD_RISK_MANAGER` (S3/S4 band, per CD-04's matrix) and successfully recorded,
  the summary correctly updating (₦455,000 loss, ₦305,000 written off, still ₦0 outstanding), a
  user with no case access denied (403), and RLS tenant isolation reconfirmed directly against
  the database (an `efims_app` session with no tenant context set sees zero rows across
  `loss_entries`/`recovery_entries`/`write_off_entries`, despite real rows existing from this
  same test pass).
- **Operational note carried forward from the `containment` session**: this pass's live-testing
  again used PowerShell's `Get-Process`/`Get-NetTCPConnection` (not Git Bash's `ps`, which misses
  real Windows processes) to manage the dev server, and `npm run build && node dist/main.js`
  instead of `start:dev`'s racy watch mode — both now standard practice for this project, not
  rediscovered.
- Seed script extended with one `LossEntry` (₦450,000 `PRINCIPAL`), one `RecoveryEntry`
  (₦150,000 `CHARGEBACK`), and one approved `LOSS_WRITE_OFF` `ApprovalRequest` + `WriteOffEntry`
  (₦300,000) on `CASE-2026-0001`, deliberately reconciling to exactly ₦0 outstanding. Ran within
  the existing 90-second transaction timeout without needing a further bump.
- **Verified**: `npx tsc --noEmit` (main + seed project), `npx prisma validate`, `npm run build`
  (Nest CLI), and `npm run lint` all pass clean, first pass, no fixes needed.
- **Documentation updated same session**: `efims-backend/README.md` (new "Recovery flow"
  section, updated "Built so far" summary, new "deliberately not here yet" bullets, seed-step
  note), `CLAUDE.md` (Status section moves `recovery` from "remaining" to "done", updated
  remaining-modules list).
- Next: `capa` (root cause, actions, validation) — the next module in the agreed-upon remaining
  sequence (`capa` → `regulatory`), the last two modules before the full backend build-out is
  complete and frontend work can begin per the user's original request.

---

## 2026-09-24 — `containment` module shipped — action requests, confirmations

- Continuation of the "full backend before frontend" build order, next module past `evidence`
  (same day's earlier entry): `containment` — architecture.md's "action requests, confirmations",
  built directly around CLAUDE.md non-negotiable #8 ("EFIMS never freezes an account or blocks a
  card itself — it only requests and waits") — now built, migrated, RLS-applied, and
  live-verified.
- **Design decision carried through the schema itself, not just application code**: no boolean
  "contained" field anywhere (not on `Case`, not computed). A case's containment posture is
  always the actual list of `ContainmentRequest` rows and each one's own `status`
  (`REQUESTED`/`CONFIRMED`/`REJECTED`/`CANCELLED`) — never a single derived flag that could drift
  from what actually happened. Status starts at `REQUESTED`, never anything implying EFIMS itself
  acted.
- **Wires up CD-04's `CONTAINMENT` action for real**, closing a gap flagged as known/deferred in
  every prior module's own README ("CD-04 names approvers for 'Containment action'... but neither
  has anything to attach to yet"): `POST .../containment-requests` requires `approvalId` to
  reference an `APPROVED` `ApprovalRequest` with `action = CONTAINMENT` for the same case, via
  `ApprovalService.assertApproved` — the exact same reusable gate `CasesService.updateStatus`
  already uses for case closure. A containment request can never exist without CD-04's approval
  matrix already having authorized it.
- **Module boundary**: `ContainmentModule` imports both `CasesModule` (case access) and
  `WorkflowModule` (`ApprovalService.assertApproved`) directly — a one-directional leaf, same
  shape as `InvestigationsModule`/`EvidenceModule`.
- **Routes**: create, list, get-by-id, `.../confirm` (records a positive `ActionConfirmed` —
  no real source-system integration exists, so this is the seam a real webhook would call,
  exercised manually for now, same "build the seam now" pattern `notifications`'s stubbed
  channels and `evidence`'s `externalRef` already use), `.../reject`, `.../cancel`. No narrower
  role gate on confirm/reject/cancel beyond the routine case-role set — the consequential gate is
  the CD-04 approval already required to create the request.
- **RLS**: `containment_requests` gets `SELECT, INSERT, UPDATE` (confirm/reject/cancel mutate the
  same row, same pattern as `approval_requests`/`sla_clocks`), no `DELETE` — the record of a
  containment request and how the source system responded is itself part of the case file.
- **A real bug found and fixed live, during this module's own verification**: nothing originally
  stopped the same approved `approvalId` from being reused across multiple `ContainmentRequest`
  rows — an approval to "suspend online access" could have been reused to also authorize "block
  the card," an action it was never actually asked to approve. Caught by deliberately testing
  reuse (create two requests off the same approval), not by inspection; the first attempt
  succeeded when it should have been rejected. Fixed with a database-level `@unique` constraint
  on `ContainmentRequest.approvalId` (the real backstop against a race between two concurrent
  creates) plus an application-level check in `ContainmentService.create` for a clean 400 instead
  of a raw Prisma constraint violation.
- **A real tooling limitation hit while fixing the bug above**: `prisma migrate dev` refuses to
  run non-interactively whenever it detects a schema change it considers risky (here: a new
  unique constraint that could fail against existing duplicate data) — even with `--create-only`,
  and even after the one duplicate row in the live database had already been deleted. No flag
  forces it through in a non-interactive shell. Worked around by hand-writing the migration
  directory and SQL (`<timestamp>_containment_approval_unique/migration.sql`, matching Prisma's
  own `<table>_<column>_key` naming convention) and applying it with `prisma migrate deploy`,
  which doesn't prompt. Documented in `efims-backend/README.md` as a reusable workaround for the
  next time this comes up, not treated as a one-off.
- **Also required manual cleanup before that migration could apply**: the reuse-bug testing
  itself had already created two live `ContainmentRequest` rows sharing one `approvalId` — adding
  the `@unique` constraint would have failed against that real duplicate. Deleted the extra row
  directly via the privileged `DIRECT_URL` connection (the pooled `efims_app` role has no DELETE
  grant on this table by design) before applying the migration.
- **Live-verified end to end** against the real Neon database: a bogus `approvalId` correctly
  rejected (400), an `approvalId` referencing an approval for a *different* action
  (`CASE_CLOSURE`) correctly rejected (400) by the same `assertApproved` check `cases` already
  relies on, a fresh `CONTAINMENT` approval requested and decided by an authorized
  `FRAUD_RISK_MANAGER` (self-approval already blocked by `workflow`'s own existing rule), a
  containment request created against it and confirmed, re-confirming an already-`CONFIRMED`
  request correctly rejected (400), reuse of the same `approvalId` correctly rejected (400, the
  fix above, re-verified after applying it), a second `REQUESTED` request rejected
  (`REJECTED`) and a third cancelled (`CANCELLED`), a wrong-case/request-id combination correctly
  404ing, and RLS tenant isolation reconfirmed directly against the database (an `efims_app`
  session with no tenant context set sees zero rows on `containment_requests`, despite real rows
  existing from this same test pass).
- **Two real environment issues hit and resolved during this session's live-testing, unrelated to
  this module's own code**: (1) a dev-server process from an earlier `nest start --watch` crash
  (documented in the `evidence` entry above) had survived as an orphan bound to port 3001 —
  invisible to Git Bash's own `ps`, only found via PowerShell's `Get-NetTCPConnection`, which is
  now the documented way to diagnose a mysterious stale-code 500/`EADDRINUSE` on this machine
  going forward; (2) starting the server with `&` inside the same Bash tool call that also
  echoed a status line raced two writes to the same log file into unreadable binary-looking
  output — resolved by using `nohup ... & disown` as a single dedicated call instead of chaining
  it with other output.
- Seed script extended with one approved `CONTAINMENT` `ApprovalRequest` and one `CONFIRMED`
  `ContainmentRequest` (a card block, referencing the same SIM-swap fraud narrative the
  investigations and evidence seed data already tell) on `CASE-2026-0001`. Ran within the
  existing 90-second transaction timeout without needing a further bump.
- **Verified**: `npx tsc --noEmit` (main + seed project), `npx prisma validate`, `npm run build`
  (Nest CLI), and `npm run lint` all pass clean, re-run after the unique-constraint fix.
- **Documentation updated same session**: `efims-backend/README.md` (new "Containment flow"
  section, updated "Built so far" summary, new "deliberately not here yet" bullets, seed-step
  note, and a new section documenting the `prisma migrate dev` non-interactive workaround),
  `CLAUDE.md` (Status section moves `containment` from "remaining" to "done", updated
  remaining-modules list).
- Next: `recovery` (loss/recovery ledger, reconciliation) — the next module in the agreed-upon
  remaining sequence (`recovery` → `capa` → `regulatory`).

---

## 2026-09-24 — `evidence` module shipped — vault, hashing, custody, legal hold

- Continuation of the "full backend before frontend" build order, next module past
  `investigations` (same day's earlier entry): `evidence` — architecture.md's "vault, hashing,
  custody, legal hold", and §7's security note: "hash on ingest + custody log, so tampering is
  detectable" — now built, migrated, RLS-applied, and live-verified.
- **Scope boundary, decided before writing any code**: this module is a hash + custody ledger,
  not a file/object store. No blob storage integration exists anywhere in this codebase yet
  (architecture.md's own module map lists `infrastructure/storage` as aspirational, not built) —
  `EvidenceItem` stores a SHA-256 hash of whatever content is supplied at ingest, plus a free-text
  `externalRef` pointer to wherever the real content lives (a DMS, S3, a shared drive), and
  discards the content itself. This mirrors the "build the seam now, wire in the real thing
  later" pattern already used for `notifications`' external channels and `ml-gateway`'s Groq
  client — a real upload/download flow is future work once object storage exists, not invented
  here ahead of need.
- **Schema** (migration `20260924171439_evidence`): `EvidenceItem` (never hard-deleted, same
  posture as `Incident`/`Case`; UPDATE is granted but the service only ever uses it for
  `legalHold*` fields — the hash and everything about what was collected is otherwise immutable
  after ingest, same spirit as `ConfigurationEntry.value`) and `CustodyEvent` (pure append-only,
  no update/delete path at all, same posture as `Interview`/`Finding`). `CustodyAction` enum:
  `COLLECTED`/`VIEWED`/`EXPORTED`/`TRANSFERRED`/`HASH_VERIFIED`.
- **Module boundary**: `EvidenceModule` imports `CasesModule` directly, same one-directional
  shape as `InvestigationsModule`. Every service method calls `CasesService.getById(actor,
  caseId)` first — the 7-condition access rule enforced there, not duplicated here.
- **Routes**: `/cases/:caseId/evidence` (ingest, list, get-by-id with full custody history),
  `.../custody` (record a custody event), `.../verify` (re-hash re-supplied content, compare to
  the stored hash — always logs a `HASH_VERIFIED` custody event and an audited
  `evidence.hash.verify` with `SUCCESS`/`FAILURE` outcome regardless of the result, mirroring how
  `audit.verify_chain` self-audits a broken chain), `.../legal-hold` (set/release, 400s on a
  no-op transition to the same state). Legal hold gets a narrower role gate
  (`LEGAL_COUNSEL`/`COMPLIANCE_MLRO`/`ADMIN`) than routine evidence handling — no CD-04 entry
  names an approver for this action, so the gate mirrors CD-05's own ownership table instead.
- **RLS**: `evidence_items` gets `SELECT, INSERT, UPDATE` (no DELETE); `custody_events` gets
  `SELECT, INSERT` only (no UPDATE/DELETE). Both added to the tenant-isolation policy loop.
- **A real environment bug found and worked around, unrelated to the module's own code**:
  `npm run start:dev` (`nest start --watch`) crashed immediately with `Cannot find module
  '.../dist/main'` right after logging "Found 0 errors. Watching for file changes." — reproduced
  twice in a row on this project's own Windows dev machine, including after a clean `rm -rf dist`.
  Diagnosed as the watch mode's run step racing its own webpack write (`dist/main.js` not yet
  flushed to disk when the child process tries to require it), not an application bug — a plain
  `npm run build` (one-shot, non-watch) reliably produced a working `dist/main.js` every time.
  Worked around for this session's live-testing by using `npm run build && npm start` instead of
  `start:dev`; documented in `efims-backend/README.md`'s Setup section as a known quirk on this
  machine, not solved at the tooling level (not investigated further — out of scope for this
  module's own work).
- **Live-verified end to end** against the real Neon database: an item ingested with content
  hashed server-side (SHA-256, independently recomputed and confirmed to match), full custody
  history returned in chronological (oldest-first) order, a `TRANSFERRED` custody event recorded,
  hash verification with matching content (`intact: true`) and with deliberately altered content
  (`intact: false`) — both logged as a `HASH_VERIFIED` custody event and an audit event with the
  correct `SUCCESS`/`FAILURE` outcome — legal hold set, a duplicate set-while-already-held
  correctly rejected (400), then released, a user with no case access denied (403, confirming
  delegation to `CasesService` rather than a duplicated check), the same user granted case access
  by joining the case's team and then correctly allowed routine evidence actions but still denied
  (403) the narrower-gated legal-hold action by role, a wrong-case/evidence-id combination
  correctly 404ing rather than leaking existence across cases, and RLS tenant isolation
  reconfirmed directly against the database (an `efims_app` session with no tenant context set
  sees zero rows on both new tables, despite real rows existing from this same test pass).
- Seed script extended with one demo evidence item (the telco SIM-swap report already referenced
  by the investigations module's demo finding) plus its three custody events
  (`COLLECTED`/`VIEWED`/`HASH_VERIFIED`) on `CASE-2026-0001`. Ran within the existing 90-second
  transaction timeout without needing a further bump this time.
- **Verified**: `npx tsc --noEmit` (main + seed project), `npx prisma validate`, `npm run build`
  (Nest CLI), and `npm run lint` all pass clean.
- **Documentation updated same session**: `efims-backend/README.md` (new "Evidence flow" section,
  updated "Built so far" summary, new "deliberately not here yet" bullets, seed-step note, and
  the `start:dev` workaround note), `CLAUDE.md` (Status section moves `evidence` from "remaining"
  to "done", updated remaining-modules list).
- Next: `containment` (action requests, confirmations — CLAUDE.md non-negotiable #8's
  confirmation-gated design: EFIMS never shows a case as "contained" until a positive
  `ActionConfirmed` comes back, and never freezes an account or blocks a card itself) — the next
  module in the agreed-upon remaining sequence (`containment` → `recovery` → `capa` →
  `regulatory`).

---

## 2026-09-24 — `investigations` module shipped — plans, issues, interviews, findings

- Continuation of the "full backend before frontend" build order, picking up the next module past
  the cross-cutting infrastructure pass and `notifications` (same day's earlier entry):
  `investigations` — architecture.md's "plans, issues, interviews, findings" — now built,
  migrated, RLS-applied, and live-verified.
- **Schema** (`prisma/schema.prisma`, migration `20260924165418_investigations`):
  `InvestigationPlan` (versioned/append-only — a new row per revision, `version` auto-incremented
  per case, same posture as `ConfigurationEntry`/`TriageAssessment` — never mutated after
  creation), `InvestigationIssue` (mutates in place: `status`/`resolution`/`resolvedBy`/
  `resolvedAt` on the same row via `.../resolve`, since there's exactly one lifecycle transition
  to record, not a revision history), `Interview` and `Finding` (pure append-only historical
  records, no update/delete path at all — same posture as `audit_events` but without the hash
  chain, since no tamper-evidence requirement was stated for these). `Finding.resolvesIssueId` is
  the one cross-entity link — optional, validated at write time to belong to the same case, but
  recording a finding does not itself resolve the issue it references; that still needs its own
  explicit call.
- **Module boundary**: `InvestigationsModule` imports `CasesModule` directly (unlike `workflow`,
  nothing in `cases` needs anything from `investigations`, so there's no circularity to design
  around). Every service method calls `CasesService.getById(actor, caseId)` first — the full
  7-condition case-access rule (non-negotiable #6) is enforced there, not duplicated here, the
  same discipline `triage` already established against `IncidentsService.getById`.
- **Routes**: all nested under `/cases/:caseId/...` (`investigation-plans`, `investigation-plans/
  current`, `issues`, `issues/:issueId/resolve`, `interviews`, `findings`) — 10 routes total.
  Writes gated to the same case-role set (`INVESTIGATOR`/`TEAM_LEAD`/`FRAUD_RISK_MANAGER`/
  `ADMIN`) used for routine case administration elsewhere; reads carry no `@Roles()` gate of
  their own, since `CasesService.getById` is the check that actually matters. Every write is
  audited (`investigations.plan.create`/`issue.raise`/`issue.resolve`/`interview.record`/
  `finding.record`) with `caseId` in the metadata.
- **RLS**: `investigation_plans`/`interviews`/`findings` are `SELECT, INSERT` only for
  `efims_app` (no UPDATE/DELETE grant at all); `investigation_issues` adds `UPDATE` for the
  resolve transition, still no `DELETE`. All four added to the tenant-isolation policy loop in
  `prisma/rls-policies.sql`.
- **A real bug found and fixed live, not in the new module's own code**: extending
  `prisma/seed.ts` with investigation demo data pushed the seed script's single cumulative
  transaction (CD-01..08 config, signal/incident/triage/case/workflow, now investigations —
  all sequential real round trips against Neon) past its 30-second timeout —
  `PrismaClientKnownRequestError: P2028 Transaction already closed`, caught on the very first
  seed run after adding the new seeding block. This is the *second* time this transaction's
  budget has needed raising as the script accumulated more modules' worth of data (see the
  2026-09-2x `cases`/`workflow` entries for the first). Fixed by bumping `timeout` from 30000 to
  90000 in the `prisma.$transaction(...)` call in `seed.ts`'s `main()`, with a comment flagging
  that a third bump should be expected if a future module's seeding pushes past it again.
  Re-ran `npm run seed` after the fix — succeeded cleanly, correctly found the already-live-tested
  investigation plan/issue/interview/finding via their idempotent `findFirst` checks and skipped
  re-creating them rather than duplicating.
- **Live-verified end to end** against the real Neon database: plan v1 created, plan v2 created
  (version auto-incremented; `.../current` correctly returns v2 while the full list still shows
  both), issue raised, interview recorded, finding recorded referencing the issue via
  `resolvesIssueId`, issue explicitly resolved via `.../resolve`, access denied (403) for a user
  failing the case's 7-condition check — confirmed as an audited `DENIED` case-access event, not
  a silent 404 — RLS tenant isolation reconfirmed (a second tenant's `efims_app` session sees zero
  rows across all four new tables), and edge cases: resolving an already-resolved issue (400), a
  `resolvesIssueId` pointing at an issue on a different case (400).
- **Verified**: `npx tsc --noEmit` (main + seed project), `npx prisma validate`, `npm run build`
  (Nest CLI), and `npm run lint` all pass clean after the seed-timeout fix.
- **Documentation updated same session**: `efims-backend/README.md` (new "Investigations flow"
  section, updated "Built so far" summary, new "deliberately not here yet" bullets for this
  module, seed-step note on the transaction-timeout history), `CLAUDE.md` (Status section moves
  `investigations` from "remaining" to "done", updated remaining-modules list).
- Next: `evidence` (vault, hashing, chain of custody, legal hold) — the next module in the
  agreed-upon remaining sequence (`evidence` → `containment` → `recovery` → `capa` →
  `regulatory`), continuing the same "full backend before frontend" build order.

---

## 2026-09-24 — Cross-cutting infrastructure pass + `notifications` module — production-readiness requirements applied across the whole backend

- Explicit request: build every remaining backend feature before starting the frontend, with
  typecheck/validation/caching/indexing/pagination/filtering/rate-limiting/push-notifications/
  Socket.IO/security applied throughout, scalability and modular structure as first-class
  concerns. This entry covers the cross-cutting half of that request (validation/typecheck were
  already standard practice throughout this codebase before now); the `notifications` module
  (originally grouped with evidence/containment/recovery/capa/regulatory in the build order) was
  pulled forward and built now since it's what the Socket.IO/event-bus infrastructure exists for.
- **Three decisions confirmed with the user before starting**, each because this project's own
  docs (or lack of any existing decision) made the default non-obvious:
  1. **Caching**: in-memory (`@nestjs/cache-manager`), not Redis — architecture.md §6 explicitly
     defers Redis until "real caching/session-scale need arises"; introducing it now would
     contradict a decision already on record, not just skip ahead of it.
  2. **Real-time**: build Socket.IO now, not deferred like Redis/Kafka were — explicit user call,
     against the same-reasoning default this session would otherwise have recommended.
  3. **Notification delivery**: build the module now with external channels (EMAIL/SMS/PUSH)
     stubbed (logged, not actually sent) rather than block on provider credentials — same "build
     the seam now, wire in the real thing later" pattern `ml-gateway` already uses for Groq.
- **Event bus** (`@nestjs/event-emitter`, wildcard-enabled): `src/common/events/domain-events.ts`
  is a shared contract file living in `common/`, owned by no single module — `workflow`'s
  `ApprovalService`/`SlaClockService` and `cases`' `CasesService` emit; `notifications` listens.
  Neither side imports the other's service, which is what let `notifications` be wired into
  `AppModule` last, after everything it reacts to, with zero changes to those modules' APIs.
- **Real-time gateway** (`src/infrastructure/realtime/`, Socket.IO at `/realtime`):
  JWT-authenticated at handshake (same secret/payload every REST endpoint already verifies),
  tenant- and user-scoped rooms. Feature modules inject `RealtimeService`
  (`emitToTenant`/`emitToUser`) — never `RealtimeGateway`/`socket.io` directly. CORS on the
  gateway is deliberately permissive (`origin: true`, unlike the Express allow-list) — its real
  access-control boundary is the mandatory JWT handshake, not CORS, since (unlike a
  cookie-authenticated endpoint) there's no ambient session for a cross-origin page to ride
  along on. Known, accepted gap: a revoked session doesn't drop an already-open socket until its
  access token naturally expires — no forced-disconnect mechanism exists yet.
- **`notifications` module**: `Notification` (IN_APP — the row's own existence is the delivery,
  pushed live via `RealtimeService` at creation) + `NotificationDelivery` (one row per stubbed
  EMAIL/SMS/PUSH attempt). Four triggers wired: `approval.requested` (notifies whoever CD-04's
  matrix authorizes to decide — resolved by `workflow` itself and included in the event payload,
  so `notifications` never needs to know that matrix), `approval.decided` (notifies the
  requester), `case.status_changed` on closure only (notifies the case team, excluding whoever
  closed it — every other transition stays silent, too routine to notify on), `sla_clock.breached`
  (notifies every `FRAUD_RISK_MANAGER`, the broadest plausible-interest role, since no per-incident
  owner exists until a case link is made). Escalation: unread `HIGH`-priority notifications past
  15 minutes get a stubbed EMAIL delivery via a `@Cron(EVERY_5_MINUTES)` sweep. "Templates" are
  hardcoded inline title/body construction, not a database table — same reasoning as `workflow`'s
  `APPROVAL_MATRIX`.
- **Rate limiting** (`@nestjs/throttler`): global guard, in-memory store, applies to every
  request including unauthenticated ones. `/health*` exempted — a load balancer polling it
  shouldn't ever get throttled into reporting a false unhealthy instance.
- **Security headers/CORS** (`helmet`, real `CORS_ORIGINS` allow-list) and **health checks**
  (`@nestjs/terminus`, liveness + DB-checking readiness) — standard production baseline, neither
  previously present.
- **Pagination retrofit**: `GET /incidents`, `GET /signals`, `GET /cases` all gained shared
  `limit`/`offset` (`PaginationQueryDto`, capped at 100). `incidents`/`cases` paginate
  post-access-filter (in-memory slice), not via SQL `LIMIT`/`OFFSET` — a DB-level page taken
  before the compartment/7-condition filter runs would return fewer than `limit` visible rows;
  documented as a known DB-efficiency tradeoff, not a bug, in each service's own doc comment.
- **Indexing pass**: found and fixed two real gaps — `TeamMembership` and `CaseUserFlag` each had
  a compound unique constraint that only serves queries filtering on its *first* column;
  `TeamsService.getUserTeamIds`/`CasesService.getFlaggedCaseIds` filter by `userId` alone, on
  every case-list/case-access check in the codebase, with no covering index until this pass.
- **A real bug found and fixed live**: with the rate limiter fired against `/auth/login`
  (105 requests, confirming `429` at request 101 exactly matching the configured limit), the test
  client's own IP got rate-limited for the remainder of the session's testing window — not a bug,
  expected behavior, but a reminder that live-testing rate limiting consumes the same budget it's
  protecting; subsequent tests paced accordingly. Two more genuine test-script mistakes (not
  application bugs) surfaced and were corrected during the realtime/notifications live test: a
  wrong-role decide attempt was first mis-targeted at a case the test user couldn't see at all
  (denied by `cases`' own access check, not the intended `workflow` role check — required adding
  the test user to the case's team first to isolate the actual check being tested), and a cleanup
  pass initially targeted the wrong case id for a dangling approval request (traced via a direct
  query, then a properly-authorized temporary user was created to close it out).
- **`npm audit`**: installing this pass's packages surfaced pre-existing vulnerabilities in this
  project's dependency tree, almost all requiring a NestJS v10 → v12 major upgrade to fully
  resolve. Applied the non-breaking `npm audit fix` only; did not force the major upgrade
  unprompted mid-build (too large/risky a change to make without being asked) — most remaining
  items are dev-tooling-only (`@nestjs/cli`'s own dependency tree), with no exploitable path
  through this project's actual runtime usage, but this is a tracked, known gap, not resolved.
- **Live-verified, same session**: two full staged flows through a real running app against Neon
  — (1) rate limiting (429 at request 101), health checks (liveness + DB-checking readiness),
  security headers, CORS allow/deny; (2) pagination on all three retrofitted endpoints; (3)
  configuration cache invalidation (a ratify was immediately visible, not stale for the TTL
  window); (4) the full realtime+notifications round trip with two real websocket clients — an
  approval request pushed live to the authorized decider, that decision pushed live back to the
  requester, both also visible and mark-as-readable via `GET /notifications`; (5) notification
  ownership enforcement (a user can't mark another user's notification read, 404 not 403). Full
  `tsc`/`prisma validate`/`nest build`/`eslint` clean throughout. A reusable manual verification
  script for the realtime+notifications flow lives at
  `test/manual/realtime-notifications.manual.js` (not a jest spec — needs a running app + seeded
  database, deliberately excluded from `npm test`).
- No automated jest test suite exists yet — flagged explicitly as a gap, not silently skipped;
  every verification in this project so far (this entry included) has been live/manual against a
  real database, not unit-tested. Worth revisiting if/when the user wants CI-enforced coverage.
- Next: the remaining build-order modules (`investigations`/`evidence`/`containment`/`recovery`/
  `capa`/`regulatory`), continuing the "backend complete before frontend" plan.

## 2026-09-22 — `audit` module shipped — tamper-evident hash chain, oversight query API; completes the MVP core incident-to-case flow

- Replaced the minimal write-only `AuditService` sink (in place since the `identity` module) with
  the real `audit` module per the MVP build order (`workflow` → `audit`, then evidence/
  containment/recovery/CAPA/regulatory/notifications "once the core incident-to-case flow works
  end-to-end" — it now does; this is the last module that build order names before that point).
  architecture.md's description — "append-only ledger, write-only API" — was already true of the
  write half; this entry adds the other half: a tamper-evidence mechanism and a read API for the
  oversight roles who actually need to review a ledger, not just write to it.
- **Hash chain**: `AuditEvent` gained `hash`/`previousHash`, one chain per tenant (never a single
  chain across tenants, which would leak cross-tenant event volume/ordering through an otherwise
  RLS-isolated table). `AuditService.record` computes each hash from the row's own fields plus
  the prior event's hash, serialized per tenant via `pg_advisory_xact_lock(hashtext(tenantId))`
  so concurrent writes for the same tenant can't both read the same "latest" hash and fork the
  chain. `AuditService.verifyChain` walks a tenant's chain and recomputes every hash.
- **Schema cleanup done as part of shipping this**: `AuditEvent.tenantId` tightened from optional
  to required — every real call site has always provided one (a pre-tenant-resolution login
  failure is deliberately never written here at all, per `AuditService`'s own doc comment), so
  the nullable column was vestigial; confirmed zero null-tenant rows existed live before
  tightening it.
- **Staged migration for introducing a required `hash` onto a table with 74 live rows**: added
  nullable, backfilled via a one-time script (using the app's own `computeAuditEventHash`, not a
  second reimplementation in raw SQL, so the two could never silently drift), then tightened to
  required in a follow-up migration once confirmed zero nulls remained. The backfill script was
  deleted immediately after — its precondition (a nullable `hash` column) no longer exists once
  the follow-up migration ran, so it can't even type-check against the current schema, and
  keeping broken dead code around serves no one.
- **A real bug found and fixed live, during this module's own verification** (following the
  precedent every module since `triage` has set — verify during the build, not after): the
  hash-canonicalization function walked `Object.keys()` on `metadata` directly. For an object
  with `undefined`-valued keys — exactly what `AuditService.query`'s own metadata (an
  `AuditEventQuery` full of optional, usually-unset filter fields) produces — this hashes a
  *different*, larger key set than what actually gets persisted: JSON serialization into Postgres
  JSONB silently drops `undefined`-valued object keys on the way in, same as plain
  `JSON.stringify` does, but the canonicalizer wasn't replicating that. The very first live call
  to `GET /audit-events` broke `verifyChain` for events that were never touched — a false
  positive from an algorithm bug, not evidence of tampering, but indistinguishable from one until
  traced down. Fixed by making `canonicalize()` mirror `JSON.stringify`'s exact `undefined`
  semantics (object keys omitted, array elements become `null`). Existing rows hashed under the
  buggy version needed recomputing under the fix — not a falsification of history, since the
  underlying event data was never touched, only a broken hash-computation tool was corrected —
  via a second one-time script (also deleted immediately after, same reasoning as the backfill
  script). Re-verified live afterward that the exact call pattern that broke it no longer does.
- **Tamper-evidence proven live, not just declared**: confirmed `efims_app` has no UPDATE grant
  on `audit_events` at all (per `rls-policies.sql`'s own `REVOKE`, and independently — a live
  attempt to `UPDATE audit_events` through the app's own database role was blocked before it
  could even run, by this environment's own safety tooling, which reasonably can't distinguish
  "testing that a control blocks this" from "doing the thing the control blocks" and erred on the
  side of refusing it). Deliberately tampered with one row's `outcome` via the privileged
  migration-owning connection instead (the one role that genuinely can bypass RLS/grants, the
  same "not preventable at the database level for a true superuser" limitation this module's own
  doc comments already state) — `GET /audit-events/verify` immediately reported `intact: false`
  with the exact tampered event's id. Restored the row afterward (also via the privileged
  connection) and re-verified the chain was intact again.
- **Query API**: `GET /audit-events` (filter by `entityType`/`entityId`/`actorUserId`/`action`/
  `outcome`/`from`/`to`, paginated), `GET /audit-events/verify` — both gated to
  `TEAM_LEAD`/`FRAUD_RISK_MANAGER`/`COMPLIANCE_MLRO`/`LEGAL_COUNSEL`/`EXECUTIVE`/`ADMIN`. Every
  call is itself audited (`audit.query`, `audit.verify_chain`) — access to the ledger is the
  sensitive event, same reasoning as `WhistleblowerVaultService`. Live-verified: an `INVESTIGATOR`
  correctly denied (403), a `COMPLIANCE_MLRO` correctly permitted (200).
- **RLS**: no grant changes needed — `audit_events` already had its SELECT/INSERT-only,
  no-UPDATE/DELETE grants from the `identity` module's entry; the new `hash`/`previousHash`
  columns are covered by those same table-level grants automatically (Postgres grants aren't
  column-scoped in this schema).
- **Verified, live, same session**: `prisma validate`/`generate`/two staged `migrate dev` runs
  against Neon, both one-time backfill/correction scripts, `npm run db:rls`, full `tsc`/
  `nest build`/`eslint`, and the real running app exercising the query API, chain verification
  (both the false-positive bug and its fix), role gating, and the deliberate-tampering test above.
- This is the last module the MVP build order names before "evidence/containment/recovery/CAPA/
  regulatory/notifications once the core incident-to-case flow works end-to-end" — it now does,
  live-verified against a real database at every step from `identity` through here. Next: pick
  one of those follow-on modules, or begin the frontend now that there's a working, verified
  backend to build it against.

## 2026-09-22 — `workflow` module scaffolded — SLA clocks + CD-04 approvals

- Added `workflow` to `efims-backend/` per the MVP build order (`cases` → `workflow` → `audit`).
  This is the module that completes CLAUDE.md's stated core flow — `identity` → `configuration`
  → `incidents` → `triage` → `cases` → `workflow` — after which the build order allows
  evidence/containment/recovery/CAPA/regulatory/notifications and the real `audit` module. Two
  genuinely separate mechanisms share this module, per architecture.md's "state machine, SLA
  clocks, approvals": SLA tracking (anchored to Incident) and a generic approval mechanism
  implementing CD-04's matrix (anchored to Case).
- **Schema**: `SlaClock` (per-incident, `calendarName` copied from the incident's current
  `TriageAssessment`, `targetDeadline` deliberately caller-supplied — CD-02's
  `containmentUrgency` is prose, not a number, so this module doesn't invent a severity-to-hours
  mapping the source doc never specified, same reasoning as CD-02's `financialLossThresholdNgn`
  staying `null`; at most one open pause window tracked directly on the row, with
  `totalPausedMinutes: Int` rather than a bigint — Prisma maps Postgres `bigint` to JS `BigInt`,
  which breaks `JSON.stringify` by default, so every controller response would have broken).
  `ApprovalRequest` (`action` — a fixed 4-value enum matching CD-04's actual rows, not a
  config-validated string — `severityBand`, `status`, request/decision audit fields).
- **Deliberate non-scope**: not a general state-machine engine. The only status-transition rule
  this module enforces is the one concrete integration point: `CasesService.updateStatus`
  requires `dto.approvalId` to reference an `APPROVED` `CASE_CLOSURE` request when transitioning
  to `CLOSED`. No other case transition, and no incident transition, requires approval.
- **Module-boundary decision that shaped the whole design**: `WorkflowModule` does NOT import
  `CasesModule`, and has no `ApprovalController` of its own — every approval route
  (`POST/GET /cases/:id/approvals`, `POST /cases/:id/approvals/:approvalId/decide`) lives on
  `CasesController` instead, which already runs `CasesService.getById`'s full access check before
  delegating to `ApprovalService`. This one-directional boundary (`cases` → `workflow`, never the
  reverse) is what lets `cases` enforce the closure-approval gate without a circular NestJS
  module dependency — `ApprovalService` itself has no case-access check of its own by design (see
  its doc comment), so it is not safe to call from anywhere that hasn't already checked access.
- **CD-04's approval matrix, hardcoded** (`APPROVAL_MATRIX` in `ApprovalService`), same reasoning
  as `cases`' `ELEVATED_ROLES` and `configuration`'s CD-owner mapping: CD-04's free-text approver
  names ("CRO/Executive", "Case Owner + peer review") don't map 1:1 onto the `Role` enum.
  Approximations documented inline, e.g. "peer review" (a process, not a role) mapped to
  `TEAM_LEAD` standing in for "a peer". `ADMIN` always authorized on top of the table, matching
  the allow-list pattern already used in `WhistleblowerVaultService`.
- **Segregation of duties**: the requester of an `ApprovalRequest` cannot decide it, enforced in
  `ApprovalService.decide` regardless of role (even `ADMIN` can't self-approve).
- **A real bug found and fixed live, same session it was introduced** (following the precedent
  `triage`/`cases` set of verifying during the build, not after): the self-approval check and the
  role-authorization check in `ApprovalService.decide` both throw `ForbiddenException`, but only
  the role check originally wrote a `DENIED` audit event — an inconsistency invisible until a
  live test specifically checked the audit trail for a self-approval denial and found nothing
  there. Every denial in this codebase is supposed to be audited (non-negotiable #6's spirit,
  applied here even though self-approval isn't literally one of the 7 case-access conditions);
  fixed by adding the missing audit call, then re-verified live that both denial reasons
  (`self_approval_blocked`, `role_not_authorized`) now appear correctly.
- **Live-verified, same session, the full mechanism end to end**: SLA clock start → breach-check
  (`isBreached`/`remainingMs` computed correctly) → duplicate-start rejection → pause → resume
  (`totalPausedMinutes` accumulated) → stop. Approval: request → self-approval blocked (403,
  audited) → wrong-role blocked (403, audited — required a second test after the first one
  accidentally tested `CasesService`'s own team-match denial instead, since the test user wasn't
  on the case's team yet; corrected by adding team membership first, isolating the actual role
  check) → correct role (`FRAUD_RISK_MANAGER`) approves → re-deciding an already-decided request
  rejected (400) → closing without an `approvalId` rejected (400, DTO validation) → closing
  referencing a still-`PENDING` request rejected (400) → closing referencing the `APPROVED`
  request succeeds, `closedAt` set. Plus a fresh RLS unscoped-vs-scoped proof on both new tables.
- **RLS**: `sla_clocks` and `approval_requests` both get SELECT/INSERT/UPDATE, no DELETE — both
  mutate the same row over their lifecycle (pause/resume/stop; decide), matching
  `configuration_entries`' ratify pattern rather than `triage_assessments`'/`case_status_history`'s
  append-only-new-row pattern.
- **Seed**: extended `prisma/seed.ts` with one demo `SlaClock` (STOPPED) on the STANDARD incident
  and one demo `ApprovalRequest` (`CASE_CLOSURE`, `APPROVED`) on `CASE-2026-0001` — which, being
  approved, also transitions that seed case to `CLOSED`, mirroring the exact flow this module's
  own live verification exercised through the real API rather than inventing separate seed logic.
- **Verified, live, same session**: `prisma validate`/`generate`/`migrate dev` against Neon,
  `npm run db:rls`, `npm run seed` (idempotent — correctly recognized the already-existing
  live-tested approval/clock data and skipped re-creating it), full `tsc`/`nest build`/`eslint`,
  and the real running app exercising every new route plus the full SLA-clock and approval flows
  above, including the audit-fix re-verification.
- This module completes the MVP build order's core incident-to-case flow. Next per that order:
  the real `audit` module (the current `AuditService` is explicitly a minimal write-only sink,
  not the module described in architecture.md — no query API, no integrity hash chain), then
  evidence/containment/recovery/CAPA/regulatory/notifications once that's in place.

## 2026-09-21 — `cases` module scaffolded — the full non-negotiable #6 access rule, implemented and live-proven

- Added `cases` to `efims-backend/` per the MVP build order (`triage` → `cases` → `workflow`).
  This is the module CLAUDE.md non-negotiable #6 and architecture.md §4.3 are actually about —
  every prior mention of "the full 7-condition case-access rule" in this codebase was a forward
  reference; this entry is where it's actually implemented, and where all 7 conditions
  (tenant, role, team-or-elevated-role, not-subject, not-conflict, clearance≥sensitivity,
  compartment) were independently exercised live against the real database, not just unit-level.
- **Schema**: `Case` (referenceCode, title/description, `status: CaseStatus`, `sensitivityLevel`
  1-4 on the *same scale as `User.clearanceLevel`* so the clearance check is a bare comparison,
  `compartment`, `assignedTeamId`), `CaseUserFlag` (one enum, `SUBJECT`/`CONFLICT`, one table —
  both are structurally identical "deny access to this (case, user) pair" flags), and
  `CaseStatusHistory` (append-only transition log, not a workflow state machine). `Incident`
  gained `caseId` (nullable FK) — the field the `incidents` module's own README had flagged as
  "still cases's, not yet built" since that module shipped.
- **Deliberate separation from triage severity**: `Case.sensitivityLevel` (who's allowed to see
  this) is NOT the same concept as a linked Incident's CD-02 `severity` (how urgent the
  response is) — never auto-derived from it. Whoever opens a case sets sensitivity explicitly.
  Flagged prominently in the schema doc comment so this doesn't get conflated later.
- **Cross-module additions this module needed to function at all**: `IncidentsService.linkToCase`
  (mirrors `markUnderReview`'s pattern — the only way `Incident.status` becomes `LINKED_TO_CASE`,
  called only by `CasesService`); `TeamsService.isUserOnTeam`/`getUserTeamIds` (single-check and
  batch-check siblings — batch exists specifically so `CasesService.list` doesn't N+1 query team
  membership per case, a lesson from this project's own earlier live-verification pass);
  `TeamsService.addMember` + `POST /teams/:id/members` (admin-only) — added because there was
  literally no way to exercise the team-match access condition through the API without it;
  `UsersService.assertUserExists` (validates a flag's target user is real).
- **"Elevated role" for the team-match bypass** (architecture.md §4.3 names the concept, not
  which roles qualify): `FRAUD_RISK_MANAGER`/`COMPLIANCE_MLRO`/`LEGAL_COUNSEL`/`EXECUTIVE`/`ADMIN`
  bypass; `INVESTIGATOR`/`TEAM_LEAD`/`CASE_OWNER` need actual `TeamMembership`. A flagged scope
  decision, not stated anywhere in the source docs — same caveat pattern as
  `ConfigurationController`'s CD-owner-to-Role mapping.
- **One more real bug found live** (this module's live-verification pass ran *during* the build,
  not after, following the precedent `triage` set): `CasesService.addFlag` used Prisma's
  `.upsert()`, which compiles to `INSERT ... ON CONFLICT DO UPDATE` — Postgres requires UPDATE
  privilege for that statement even on the path that never actually updates a row. But
  `case_user_flags` deliberately has no UPDATE grant (delete-then-recreate is the intended
  mutation path — see the model's schema doc comment). First live call failed with
  `permission denied for table case_user_flags`. Fixed in the service code (explicit
  delete-then-create inside one transaction), not by loosening the grant — the grant was correct,
  the code didn't match its own documented design yet.
- **Live-verified, same session, every one of the 7 conditions independently**: created two test
  users with controlled clearance/team-membership, then proved — team-match denial (not on
  team) and grant (added via the new `POST /teams/:id/members`, access restored); clearance
  denial (clearanceLevel 1 vs. sensitivityLevel 2); `SUBJECT` flag denial and restoration after
  removal; compartment denial (`AML_MLRO` case, no grant) and admin success (has the grant). Plus
  the ordinary flow: case creation with incident linking (confirmed `Incident.status` flips to
  `LINKED_TO_CASE`), status transition with history logging, duplicate-transition rejection, and
  a fresh RLS unscoped-vs-scoped proof on all three new tables (all 0 unscoped).
- **Test data cleanup**: two test users and their memberships/refresh tokens were deleted after
  verification (same practice as prior modules). The cases/flags/history rows created during
  testing could **not** all be cleaned up — `cases`/`case_status_history` have no DELETE grant by
  design, so the two test cases (`CASE-2026-0001`, formally adopted into `seed.ts` as the
  official demo case; `CASE-2026-0002`, an incidental `AML_MLRO`-compartment case from the
  compartment-denial test) now exist permanently. Not a problem — treated the same way as
  `triage`'s own permanent test-escalation data: the append-only guarantee held even against
  deliberate cleanup, which is itself a form of live proof that the grants are real.
- **RLS**: `cases` gets SELECT/INSERT/UPDATE, no DELETE (status transitions, not row removal,
  same as `incidents`). `case_status_history` gets SELECT/INSERT only, no UPDATE/DELETE (pure
  append-only, same as `triage_assessments`). `case_user_flags` gets SELECT/INSERT/DELETE, no
  UPDATE — an access-control mechanism, not a historical record, closer in spirit to
  `user_compartment_grants` than to an audit trail.
- **Seed**: extended `prisma/seed.ts` with one demo `Case` (`CASE-2026-0001`, linked to the
  STANDARD incident) — the WHISTLEBLOWER incident is left un-linked, so seed data spans all three
  stages (raw signal, triaged incident, linked case) rather than everything pre-processed.
- **Verified, live, same session**: `prisma validate`/`generate`/`migrate dev` against Neon,
  `npm run db:rls`, `npm run seed` (idempotent — correctly adopted the already-existing test case
  without resetting its live-tested `UNDER_INVESTIGATION` status), full `tsc`/`nest build`/
  `eslint`, and the real running app exercising every new route plus the full access-control
  matrix above.
- Next: `workflow` per the MVP build order.

## 2026-09-21 — `triage` module scaffolded (severity, routing, escalation) — live-verified from day one

- Added `triage` to `efims-backend/` per the MVP build order (`incidents` → `triage` → `cases`).
  Implements architecture.md's module-map description exactly: "severity engine, routing,
  escalation". Unlike every prior module, this one was verified live against Neon *in the same
  session it was built* (using the setup from the entry below) rather than statically first and
  live later — the whole assess → duplicate-rejection → escalate → history → invalid-config-
  rejection flow was exercised through the real running app before being called done.
- **Schema**: `SeverityTier` enum (`S1`-`S4`, fixed by design — unlike CD-01's freeform
  categories, CD-02's tier *names* don't vary per tenant) and `TriageAssessment` (severity,
  `slaCalendarName`, optional `assignedTeamId`, required `rationale`, `previousAssessmentId`
  self-relation). Append-only, same posture as `ConfigurationEntry`'s version history: a
  `TriageAssessment` is never mutated after creation, and an incident's *current* triage state is
  simply its latest assessment — no separate synced "current" field anywhere. Deliberately no
  severity-direction constraint on `escalate` — a downward correction is exactly as valid a
  revision event as an upward escalation.
- **Deliberately kept off `Incident` itself**: severity and routing live entirely in
  `TriageAssessment`, not as columns on the `Incident` row — the same "keep concerns in their own
  module's table" discipline `incidents` already established for Signal vs. Incident. The one
  narrow exception: `IncidentsService.markUnderReview`, a new single-direction status transition
  (`OPEN` → `UNDER_REVIEW`) that `triage` triggers on an incident's first assessment — not a
  general state machine (architecture.md assigns that to `workflow`, not `triage`), just the one
  transition needed to keep `Incident.status` from sitting at `OPEN` forever once triage has
  actually looked at it.
- **New cross-module surface in `identity`**: `Team`/`TeamMembership` existed in the schema since
  the `identity` module shipped but had no service or API touching them at all — `triage` needed
  a way to validate and discover routing teams, so this module added `TeamsService`
  (`list`/`assertExists`) and a minimal `GET /teams` route, mirroring how `getGrantedCompartments`
  was added to `UsersService` specifically for `incidents`' needs.
- **CD-03 validation live-tests the config boundary two levels deep**: `TriageService` validates
  `slaCalendarName` against `ConfigurationService.getCurrent(CD_03_SLA_CALENDARS)` — the second
  module (after `incidents`' CD-01 check) to consume `configuration`'s read API as a real
  consumer, confirming that boundary holds under a second, independent use case.
- **RLS**: `triage_assessments` gets SELECT/INSERT only — no UPDATE, no DELETE at all, stricter
  even than `configuration_entries` (which still needs UPDATE for the ratify transition). Proven
  live, not just declared: attempting to clean up test data created during this session's own
  live smoke test failed with `permission denied for table triage_assessments` through the
  `efims_app` role, exactly as designed — the append-only guarantee held even against deliberate
  manual cleanup, so that test data (a real S2→S1 escalation chain) now permanently exists as
  seeded-adjacent demo data.
- **Seed**: extended `prisma/seed.ts` with one demo `TriageAssessment` (S2, `24x7`) on the
  STANDARD fraud incident — the WHISTLEBLOWER incident is left un-triaged on purpose, so the seed
  data shows both states rather than everything pre-processed.
- **Verified, live, same session**: `prisma validate`/`generate`/`migrate dev` against Neon,
  `npm run db:rls`, `npm run seed`, full `tsc`/`nest build`/`eslint`, and a real running app
  exercising every new route — `GET /teams`, `POST .../triage` (including the OPEN→UNDER_REVIEW
  side effect and the duplicate-assessment 400), `POST .../triage/escalate` (including the
  revision chain and the CD-03 rejection path), `GET .../triage`, `GET .../triage/history` — plus
  a fresh RLS unscoped-vs-scoped proof against the new table.
- Next: `cases` per the MVP build order.

## 2026-09-21 — First live database verification (Neon): 4 real bugs found and fixed

- Set up a real Postgres database for the first time in this project's history — Neon's free
  tier, chosen over a local install after the local Postgres superuser password turned out to be
  unrecoverable without an elevation this environment doesn't have, and over Render's free
  Postgres tier because that one expires after 30 days (not viable as an everyday dev DB, even
  though Render is the confirmed production target per `docs/architecture.md`). Ran the full
  `identity` + `configuration` + `incidents` module stack against it end to end for the first
  time — migrations, RLS policies, seed data, and the live NestJS app itself. Every prior
  "verified" note in this changelog (2026-09-18, 2026-09-21 ×2) meant *static* verification only
  (`tsc`, `prisma validate`, `nest build`, `eslint`) — this entry is the first time any of it ran
  against a real database. It surfaced four genuine bugs that three straight modules' worth of
  static verification never could have caught, all now fixed:

  1. **Session-scoped `set_config` leaks tenant context across unrelated pooled connections.**
     `prisma/seed.ts` originally set `app.current_tenant` at session scope (`false`) — safe
     against a direct local Postgres connection, but proven live to leak across completely
     separate client connections reusing the same PgBouncer-pooled backend on Neon: a fresh
     `psql` session, with no query ever run before it, inherited the previous session's tenant
     id. **This was a real cross-tenant data exposure vector**, not a theoretical one — confirmed
     by directly querying `current_setting('app.current_tenant', true)` on a brand new
     connection and seeing the previous script's tenant id come back. Fixed by rewriting
     `seed.ts` to run every tenant-scoped write inside one `$transaction` with `set_config(...,
     true)` as the first statement — the same transaction-local pattern
     `PrismaService.withTenant`/`forCurrentTenant` already used correctly; the app's own runtime
     code was never affected, only this one script. Documented as a hard rule in
     `efims-backend/README.md`'s new "pooled connections" section, since it's exactly the kind of
     mistake anyone hand-writing SQL against this database later could repeat.
  2. **`JwtAuthGuard` (global, via `APP_GUARD` in `AppModule`) couldn't resolve `JwtService`** —
     `JwtModule` was registered inside `IdentityModule` but never exported, so `AppModule`'s own
     injector (where `APP_GUARD` providers actually get instantiated) couldn't see it. The app
     failed at boot with a DI resolution error on its very first run — invisible to `tsc`/`nest
     build`/`eslint`, none of which instantiate Nest's actual DI container. Fixed by adding
     `JwtModule` to `IdentityModule`'s `exports`.
  3. **`ConfigurationService.getAllCurrent()` fired 8 concurrent `$transaction`s** (one per CD
     key, via `Promise.all`) — fine against local Postgres, but against a real remote/pooled
     database this exhausted available transaction slots and threw `"Unable to start a
     transaction in the given time"`, with collateral failures on unrelated concurrent requests
     (`IncidentsService.list` failed the same way moments later, from the same contention).
     Fixed by consolidating all 8 lookups into one transaction, sequentially — which is also a
     genuine correctness improvement (one consistent snapshot instead of 8 independently-
     committed reads). Also flattened `ConfigurationController.getOne`'s 2-way `Promise.all` to
     sequential awaits for the same reason, pre-emptively.
  4. **Prisma's default transaction budget (2s to acquire, 5s to complete) was too tight for this
     database's real round-trip latency** even after fix #3 — single-query transactions still
     occasionally failed to acquire a slot in time, and `getAllCurrent`'s now-sequential 16-query
     transaction outright expired mid-flight (`"Transaction ... old closed transaction"`). Fixed
     at the one shared chokepoint every tenant-scoped call already goes through —
     `PrismaService.withTenant` now passes `{ maxWait: 10000, timeout: 20000 }` to every
     `$transaction` it opens, project-wide, rather than patching individual call sites as each
     one was discovered.

- **What DID work correctly the first time, live, no fixes needed**: RLS tenant isolation
  (confirmed with real seeded data present, not just an empty database — an unscoped `efims_app`
  connection saw 0 rows, a tenant-scoped one saw exactly that tenant's data); Incident-level
  compartment visibility filtering (a fresh `INVESTIGATOR` user with no compartment grants
  correctly saw only the `STANDARD` incident in `GET /incidents`, and got a `403` — with a
  `DENIED` audit event actually written — on `GET /incidents/:id` for the `WHISTLEBLOWING` one);
  the full login → JWT → protected-route flow; and the Signal→Incident seed data end to end.
  Non-negotiables #5 and #6 both hold up against a real database, not just on paper.
- **Neon setup specifics, for future reference**: `schema.prisma`'s datasource now has both `url`
  (efims_app, pooled — the app's runtime connection) and `directUrl` (the migration-owning role,
  unpooled — required for Prisma Migrate's advisory locks, which don't work through PgBouncer).
  Neon's control plane rejects a `CREATE ROLE ... PASSWORD` that's too weak *at the SQL level*,
  not just as an application-side opinion — `rls-policies.sql`'s placeholder password had to be
  strengthened from a literal `"changeme"` to pass that check, with a comment instructing readers
  to rotate it immediately after running the script (which this session did, to a random
  32-byte value, kept only in the gitignored `.env`).
- Updated `efims-backend/README.md`: setup steps now cover `DIRECT_URL` and the
  privileged-role/`efims_app` password-rotation step; a new section documents the pooled-
  connection `set_config` rule as a hard constraint, not a suggestion; a note on the transaction
  timeout tuning points back to `PrismaService.withTenant`'s doc comment. Updated `.env.example`
  to include `DIRECT_URL` with an explanation of when it's required.
- This is exactly the class of finding "verified: prisma validate/generate, tsc, nest build,
  eslint — not verified: no live Postgres" was flagging as a real gap in every prior entry, not
  a formality — worth remembering next time that caveat shows up again for a module not yet
  tested live.

## 2026-09-21 — `incidents` module scaffolded (Signal → Incident intake/triage)

- Added `incidents` to `efims-backend/` per the MVP build order (`configuration` → `incidents` →
  ...). Implements the Signal → Incident half of non-negotiable #1 as two genuinely separate
  tables, with the only path from one to the other being a human triage decision at
  `POST /signals/:id/validate` — there is deliberately no `POST /incidents` route anywhere in
  the module.
- **Schema**: `Signal` (source/summary/payload/status, `SignalStatus` = NEW → VALIDATED |
  REJECTED | MERGED), `Incident` (category/type/subtype/title/description/compartment/status,
  unique per-tenant `referenceCode` like `INC-2026-0001`), `IncidentRelation` (many-to-many
  "related incidents" links), and `WhistleblowerIdentityVaultEntry` (1:1 with a
  WHISTLEBLOWER-sourced Signal). No severity field and no case-linkage field on `Incident` at
  all — both are deliberately out of scope (`triage`'s and `cases`' jobs respectively once those
  modules exist); `IncidentStatus.LINKED_TO_CASE` exists only as a placeholder value this module
  never sets.
- **Atomicity across the module boundary**: two places where two tables must commit together or
  not at all, both implemented by passing the caller's open transaction (`TenantScopedClient`)
  into the callee rather than each service opening its own: (1) `SignalsService.create` +
  `WhistleblowerVaultService.createEntry` — a whistleblower Signal can never exist without its
  vault entry, even an anonymous one; (2) `SignalsService.validate` + `IncidentsService.
  createFromSignal` — a Signal can never end up `VALIDATED` without its Incident existing, or
  vice versa. `IncidentsService.createFromSignal` is written to only ever be called this way (it
  takes `tx` as a required first parameter, never opens its own transaction), which is also what
  structurally enforces "no Incident without a Signal" beyond just there being no create route.
- **Compartment visibility extended to Incident level** (a deliberate extension beyond what
  architecture.md §4.3 literally scopes to `cases`): `IncidentsService.getById`/`list` filter by
  `compartment === STANDARD OR compartment ∈ actor's granted compartments`, reading grants via a
  new `UsersService.getGrantedCompartments(userId)` method (identity module) rather than
  querying `user_compartment_grants` directly, per the module-boundary rule (non-negotiable #2).
  A single-resource denial is audited (`DENIED`, `incidents.incident.view`); list-level scoping
  is silent filtering, not an audited event — matches how identity's own grants behave elsewhere.
  Rationale: a WHISTLEBLOWING or AML_MLRO incident is exactly the kind of thing that shouldn't be
  visible to an arbitrary investigator before `cases` exists to enforce the full 7-condition
  check; waiting for `cases` to add this would leave a real gap in the meantime.
- **Whistleblower identity vault** (non-negotiable #7): `WhistleblowerVaultService` is the sole
  code path that reads or writes `WhistleblowerIdentityVaultEntry`. Read access gated to
  `COMPLIANCE_MLRO`/`LEGAL_COUNSEL`/`ADMIN` only — deliberately excludes the investigator working
  the resulting incident day-to-day. Every read is audited regardless of outcome (not just
  denials, unlike `RolesGuard`'s pattern), since access itself to this vault is the sensitive
  event.
- **CD-01 taxonomy as live validation, not a hardcoded list**: `IncidentsService.
  assertValidTaxonomy` calls `ConfigurationService.getCurrent(CD_01_INCIDENT_TAXONOMY)` on every
  Incident creation and rejects unknown category/type combinations — the first real cross-module
  consumer of the `configuration` module's read API, confirming that boundary works as designed.
- **Seed**: extended `prisma/seed.ts` with 2 demo Signal→Incident pairs (one STANDARD fraud
  incident, one WHISTLEBLOWER incident with its vault entry as anonymous) written directly
  against Prisma (no NestJS DI container in a seed script) rather than through the services —
  flagged in the script's own comment as not a substitute for exercising the real API flow.
- **RLS**: `rls-policies.sql` updated — `signals`/`incidents`/`whistleblower_identity_vault` get
  SELECT/INSERT/UPDATE with DELETE revoked (same append-only-by-grant pattern as
  `configuration_entries`/`audit_events` — a Signal or Incident is never actually deleted, only
  status-transitioned); `incident_relations` gets DELETE too (an incident relation, unlike the
  incident/signal it connects, is a plain link that can legitimately be un-linked).
- **Verified**: `prisma validate`, `prisma generate`, `tsc --noEmit` (both the main app's
  tsconfig and the seed script's separate one), `nest build`, and `eslint` all pass clean.
  **Not verified**: same caveat as the two prior entries — no live Postgres credentials
  available in this environment, so the Signal/Incident/vault flow, the RLS policies, and the
  seeded demo data haven't been exercised against a real database yet.
- Next: either verify this (and the two prior modules) against a real Postgres instance, or move
  on to `triage` per the MVP build order.

## 2026-09-21 — `configuration` module scaffolded (CD-01–CD-08 as versioned config)

- Added `configuration` to `efims-backend/` per the MVP build order (`identity` →
  `configuration` → ...). Implements every item in `docs/configuration-decisions.md` as
  versioned, per-tenant config with a draft → ratify → superseded lifecycle, per that doc's own
  framing ("implemented as versioned, per-tenant configuration ... not hardcoded").
- **Schema**: one generic `ConfigurationEntry` table (`key: CdKey` enum for CD-01..CD-08,
  `version: Int`, `value: Json`, `status: DRAFT|RATIFIED|SUPERSEDED`, `effectiveDate`,
  `createdBy`, `ratifiedBy`/`ratifiedAt`) rather than 8 bespoke tables — the 8 CD payload shapes
  are too different for a shared table, but the versioning/ratification/audit lifecycle is
  identical across all 8, so one table with 8 TypeScript-typed payload shapes
  (`cd-value.types.ts`) avoided 8x the boilerplate. Each shape is transcribed directly from the
  doc's tables (taxonomy tree, severity tiers, SLA calendars, approval matrix, retention
  classes, migration scope, RTO/RPO tiers, AI phase/guardrail table).
- **Deliberate scope decision on tenancy**: architecture.md §4.2 describes CD values as living
  in "the control plane" alongside `Tenant` — read that as being about *governance* (an
  approval workflow, not ordinary CRUD), not about cross-tenant visibility. Kept
  `ConfigurationEntry` tenant-scoped and RLS-protected like every other business table, since a
  bank's own severity thresholds/retention schedule/approval matrix are exactly the kind of
  per-bank data non-negotiable #5 exists to isolate. Documented explicitly in both
  `schema.prisma` and this entry so it doesn't read as an accidental deviation from
  architecture.md later.
- **"Current" value resolution**: latest RATIFIED version with `effectiveDate <= now`, falling
  back to the latest DRAFT if nothing's ratified yet — required by non-negotiable #9 (CD values
  are working defaults until ratified, but the system still needs something to run on
  meanwhile). `ConfigurationService.getCurrent(key)` is the only sanctioned read path for
  future modules (`triage`, `cases`, etc.) once they exist — no other module may query
  `ConfigurationEntry` directly, per non-negotiable #2.
- **Naira thresholds / amount bands / cutover date deliberately left `null`**: CD-02's
  financial-loss thresholds, CD-04's amount bands, and CD-06's cutover date are explicitly
  flagged in the source doc as *not EFIMS's to invent* (Board Risk Committee / Governance /
  Sponsor decisions respectively) — seeded as `null`, not a guessed placeholder number.
- **Seed**: extended `prisma/seed.ts` to create all 8 CDs as unratified DRAFT v1 for tenant
  `bank-1`, authored by the bootstrap admin, with every value transcribed verbatim from
  `docs/configuration-decisions.md` (not synthesized).
- **Role gating**: mutation endpoints (`POST /configuration/:key`,
  `POST /configuration/:key/:version/ratify`) gated to `Role.ADMIN`/`Role.EXECUTIVE` as a
  stand-in for the actual named CD owner (Fraud Risk, Risk/Executive, Operations, Governance,
  Legal/Records, Sponsor, Technology, Model Governance) — none of which map 1:1 onto identity's
  `Role` enum. Flagged as a known gap, not solved here; a real per-CD-owner approval mapping is
  future work.
- **RLS**: `rls-policies.sql` updated — `configuration_entries` gets SELECT/INSERT/UPDATE
  (UPDATE needed for the ratify transition) but DELETE is revoked at the grant level (version
  history is permanent, never deleted) — same belt-and-suspenders pattern as `audit_events`,
  slightly relaxed since ratification legitimately needs UPDATE where audit events need none.
- **Verified**: `prisma validate`, `prisma generate`, `tsc --noEmit` (both the main app's
  tsconfig and the seed script's separate one), `nest build`, and `eslint` all pass clean.
  **Not verified**: same as the 2026-09-18 identity entry — no live Postgres credentials
  available in this environment, so the migration/RLS/seed/ratify flow hasn't been exercised
  against a real database yet.
- Next: either verify this (and the identity module) against a real Postgres instance, or move
  on to `incidents` per the MVP build order.

## 2026-09-18 — `identity` module scaffolded (first backend code)

- Created `efims-backend/` — NestJS modular monolith per `docs/architecture.md` §2, with the
  `identity` module built out plus the minimal `audit`-write plumbing identity depends on.
  First real application code in the repo; everything before this was documentation and design
  mockups.
- **Schema (`prisma/schema.prisma`)**: `Tenant` in the control plane (no RLS); tenant-scoped
  `User`, `UserCompartmentGrant`, `Team`, `TeamMembership`, `RefreshToken`, `AuditEvent`.
  `User.clearanceLevel` is a plain integer (1–4) specifically so the `cases` module's future
  `user.clearanceLevel >= case.sensitivityLevel` check (non-negotiable #6) is a bare comparison.
  `Compartment` enum matches non-negotiable #7 exactly (`STANDARD`/`AML_MLRO`/`WHISTLEBLOWING`/
  `LEGAL_PRIVILEGE`/`HR`/`EXECUTIVE`).
- **Tenant isolation (non-negotiable #5), enforced twice**: `prisma/rls-policies.sql` adds a
  `tenant_isolation` RLS policy (`tenantId = current_setting('app.current_tenant')`) plus
  `FORCE ROW LEVEL SECURITY` on every tenant-scoped table, and creates a dedicated non-superuser
  `efims_app` role the app connects as (superusers/table owners bypass RLS regardless of policy
  count — a common footgun this avoids). At the application layer,
  `PrismaService.withTenant`/`forCurrentTenant` + `TenantContextInterceptor` set that session
  variable per request from the JWT's `tenantId` claim, via `AsyncLocalStorage` — this is the
  "tenant-context middleware" architecture.md §4.2 describes, implemented as an interceptor
  instead of Express middleware so it can wrap the whole downstream async chain, not just the
  pre-handler phase.
- **Auth**: `POST /auth/login` (tenant slug + email + password → access + refresh JWT pair),
  `POST /auth/refresh` (rotates the refresh token on every use; detects reuse of an
  already-rotated-out token as a possible-theft signal and revokes all of that user's other
  refresh tokens when it happens), `POST /auth/logout`. Passwords hashed with argon2.
- **Audit-write (non-negotiable #3 & #6, partial)**: `AuditService.record()` is the only
  write path onto `AuditEvent` — no update/delete method exists in code, and
  `rls-policies.sql` additionally `REVOKE`s UPDATE/DELETE on `audit_events` from `efims_app` at
  the database grant level, so the append-only guarantee holds even against a raw-SQL bug, not
  just application code discipline. `RolesGuard` writes a `DENIED` audit event on every
  role-check failure, following the same rule non-negotiable #6 states for case-access denials.
  This is explicitly **not** the full `audit` module from the build order — no query API, no
  integrity hash chain yet — see the doc comment on `AuditService` and on the `AuditEvent`
  model.
- **Users**: `GET /users/me`, `POST /users` (admin-only, creates a user in the *acting admin's
  own tenant* — there is no way to pass a different tenant id into the endpoint, closing off the
  application-layer half of cross-tenant creation even before RLS would catch it).
- **Verified**: `npx prisma validate`, `npx tsc --noEmit`, `npm run build` (Nest CLI), and
  `npm run lint` all pass clean. **Not verified**: no live Postgres credentials were available
  in this environment to actually run `prisma migrate dev`, apply `rls-policies.sql`, or seed/
  exercise the login flow end-to-end — the RLS design is correct on paper and by static
  analysis, but hasn't been proven against a real database yet. `efims-backend/README.md` has
  full setup steps, including a manual check to prove RLS actually denies an unscoped
  connection (not just that it "seems to work" through the API).
- **Deliberately deferred** (see `efims-backend/README.md`'s closing section): no password
  reset/invite flow, `User.role` is a single enum not a permission system, and the full
  7-condition case-access check from architecture.md §4.3 is NOT implemented here — only the
  pieces identity owns (auth, clearance, compartment grants) exist; the rest belongs to `cases`.
- Next: either get this verified against a real Postgres instance, or move on to scaffolding
  `configuration` per the MVP build order.

## 2026-09-18 — `docs/design-system.md` reconciled against shipped mockup palette (v1.1.0 → v1.2.0)

- Rewrote `docs/design-system.md` end to end so its color and font tokens match what's actually
  used across all 35 saved mockups (`mockups/screens/*.html`), cross-checked against
  `mockups/design-tokens/botanical-executive.md`'s frontmatter. This resolves the discrepancy
  flagged on 2026-09-15.
- Key corrections: `primary` `#1E3835` → `#072320`; `primary-container` `#122422` → `#1E3835`;
  `secondary` `#D48372` → `#735854`; `secondary-container` `#F7D3CD` → `#FFDAD4`; `outline`
  `#D8D1CB` → `#727877`. Body/UI font `Inter` → `Plus Jakarta Sans` (no mockup loads or
  references Inter). Added ~30 previously-missing tokens (`tertiary`, `error`, all `-fixed`
  variants) that the real system uses but the hand-authored v1.1.0 doc never modeled. Replaced
  the invented border-radius scale (4/6/10/16px) with the real one (4/8/12px + un-extended
  Tailwind 2xl/3xl for hero cards). Confirmed the existing elevation shadow values were already
  correct — no change needed there.
- Kept the Severity & Status token table (S1–S4, verified/frozen-lien) largely intact but
  corrected shade values (Tailwind 500-weight, not 600-weight) and noted explicitly that these
  are a deliberately separate raw-utility color layer, not derived from the Botanical Executive
  brand tokens — confirmed by literal hex usage in mockup severity badges.
- Every changed value in the doc carries an inline `~~old value~~` so the diff from v1.1.0 is
  traceable without needing git history.
- Not yet done: propagating these corrected tokens into an actual `tailwind.config` file in a
  real frontend codebase — there is no frontend scaffold yet (still pre-`identity`-module per
  the MVP build order). This was a docs-only reconciliation.

## 2026-09-15 — Batch 2 & 3 UI mockups saved (15/15); design-token source docs recovered

- Saved all 15 screens from batches 2 and 3 to `mockups/screens/` — these turned out to include
  full HTML source after all (my earlier read of batch 2 as "images only" was wrong; corrected
  by the user). Total mockups now saved: 35/35 across all three batches.
- Batch 3 also included two full `DESIGN.md`-style token exports, saved to
  `mockups/design-tokens/`:
  - `botanical-executive.md` — matches the palette used by nearly all mockups. Its own YAML
    frontmatter and prose body are internally inconsistent with each other (frontmatter matches
    the mockups; prose matches `docs/design-system.md` instead). Frontmatter should be treated
    as canonical.
  - `efims-vanguard-precision.md` — a second, distinct design system (teal/blue, Inter +
    JetBrains Mono) matching the two previously-flagged outlier screens (`command-center-alt.html`,
    `notification-center-drawer-vanguard.html`). Source comments confirm this was an earlier
    design explored and later restyled into Botanical Executive.
  - These don't yet resolve the `docs/design-system.md` vs. mockup token mismatch flagged
    2026-09-15 earlier today — a reconciliation pass on that doc is still pending, but we now
    have a corroborating canonical source (the frontmatter) to reconcile against.
- One image (a "Velora" dashboard) arrived in the batch but is a different, unrelated product —
  not saved as an EFIMS mockup.
- Updated `mockups/README.md` with the full batch 2/3 inventory and design-token source doc
  pointers.
- No code written yet. Next: scaffold backend (`identity` module first, per MVP build order), or
  do the `docs/design-system.md` reconciliation pass first if the user wants design finalized
  before backend work starts.

## 2026-09-15 — Batch 1 UI mockups saved (20/20)

- Saved all 20 user-supplied HTML mockups (Tailwind + Material Symbols, fully coded with
  screenshots) verbatim to `mockups/screens/`. Added [mockups/README.md](../mockups/README.md)
  as an inventory/index of all saved screens.
- Flagged two open issues for later resolution, documented in `mockups/README.md`:
  - **Design token mismatch**: `docs/design-system.md` (hand-authored from the standalone
    tokens doc) uses different hex values and body font (Inter) than the actual mockup HTML
    (Plus Jakarta Sans, different `primary`/`primary-container`/etc. hex values). Mockups look
    like the more complete/current source — needs a reconciliation pass and user confirmation.
  - **Two inconsistent Operational Command Center variants** saved (`command-center.html` using
    ad hoc color names, `command-center-alt.html` using an unrelated teal/blue palette) — neither
    matches the token convention used by the other 18 screens. Need user to confirm which (if
    either) is canonical.
- **Batch 2 blocked**: user sent a second batch of screens as rendered images only, with no HTML
  source (unlike batch 1). Cannot save as working code without source; asked user to either
  supply HTML or confirm a visual-only reference is acceptable. Awaiting reply.
- No code written yet. Next: scaffold backend (`identity` module first, per MVP build order).

## 2026-09-15 — Documentation initialized

- Set up `CLAUDE.md` and `docs/` from source materials supplied by the user:
  - `Integrate_Fraud_System_Design.pdf` → [architecture.md](architecture.md)
  - `efims_frontend_design_tokens_storybook_stories_documentation.txt` (superset of the
    earlier plain component-docs version) → [design-system.md](design-system.md)
  - `EFIMS_Configuration_Decisions_CD01-CD08.md` (canonical over the two identical draft
    versions) → [configuration-decisions.md](configuration-decisions.md)
- No code written yet. Next: scaffold backend (`identity` module first, per MVP build order)
  and frontend per the confirmed toolset.
