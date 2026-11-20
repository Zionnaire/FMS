# EFIMS — Open Items

Known, confirmed gaps that are not yet closed. This is a tracking list, not a judgment — every
item here was deliberately deferred with a documented reason (see `docs/CHANGELOG.md` and
`docs/DECISIONS.md`), not silently missed. Update this list as items close; don't let it drift from
reality.

## Blocking a real pilot with real bank data

- **CD-01 through CD-08 are all unratified drafts.** Every configuration value (incident taxonomy,
  severity thresholds, SLA calendars, approval matrix, retention schedule, migration scope,
  RTO/RPO targets, AI use-case release scope) is a working default for build purposes. None may be
  represented to a bank, regulator, or stakeholder as final policy until the owning function named
  in `docs/configuration-decisions.md`'s ownership table actually signs off. See that doc's own
  ratification tracker — every row currently reads `Draft`.
- ~~**The ML engineer's real inference API is not yet delivered.**~~ **Closed 2026-11-18**: the
  real EFIMS AI Service (v1.0) is live at `https://efims-ai.onrender.com` and `ml-gateway` is
  wired to it — `X-API-Key` auth, a 90s request timeout for the free-tier's cold-start behavior,
  and a new `MlPredictionRecord` table logging every structured-model `prediction_id` plus
  whether an analyst later accepted or overrode it (the vendor's own integration spec, rule #3),
  with a `PATCH /ml-gateway/predictions/:predictionId/decision` endpoint and a decide UI wired
  into the severity-suggestion panel. Live-verified end to end against the real hosted instance
  (health check, a real severity prediction, a real anomaly score, the decide endpoint, and the
  one-way-decide guard) — see `docs/CHANGELOG.md`'s 2026-11-18 entry. Still true, carried over
  from the vendor's own doc rather than smoothed over: **models are trained on synthetic data —
  "use for integration and testing, not for real decisions yet."** **2026-11-19**: the decide UI
  is now a shared component (`PredictionDecisionControls`) used by all three panels — severity,
  the transaction-risk-scoring tool (anomaly), and the case recovery-prediction panel — not just
  severity as first shipped.
- **Data residency and NDPA (Nigeria Data Protection Act) review has not happened.** Current
  hosting is Render/Neon in whatever region they default to; no formal residency statement or legal
  review has been done. This must be resolved before any real customer/transaction data touches the
  system.
- **No legal/compliance documentation exists** — no privacy notice, terms of service, Data
  Processing Agreement, or sub-processor list. Nothing here has been reviewed by counsel.

## Confirmed architectural/operational gaps (from the 2026-11-02 production-readiness audit)

- ~~Zero automated tests in either app.~~ **Partially closed 2026-11-10 (hardening Phase 1):**
  backend now has a committed Jest/Supertest e2e suite (`efims-backend/test/e2e/`) against a real
  Postgres database, covering tenant isolation, the full 7-condition case-access rule, audit-ledger
  integrity, the containment confirmation gate, auth/session security, and the ml-gateway advisory
  boundary — 36 tests, ~65% statement coverage on the modules those 6 suites exercise. **Frontend
  Playwright e2e is still not started** — every frontend "live-verified" claim remains a manual,
  uncommitted script. CI (`.github/workflows/ci.yml`) runs lint/typecheck/build/dependency-audit for
  both apps on every PR; the backend e2e job is gated on a repo variable until a CI-dedicated test
  database's secrets are configured (see `efims-backend/test/e2e/README.md`).
- ~~No deployment pipeline.~~ **Closed 2026-11-16**: `render.yaml` at the repo root deploys both
  services via Render's native Node runtime (no `Dockerfile` — see `docs/CHANGELOG.md`'s dated
  entry for why). `docs/deployment.md` documents the one manual one-time step the Blueprint spec
  itself can't automate (no confirmed syntax exists for copying one service's public URL into
  another's env var) and the one-time RLS setup for a fresh database. **Not yet done**: an actual
  live deploy to a real Render account to confirm the Blueprint deploys clean end-to-end — this
  was written against Render's documented spec and verified to parse/structure correctly, but has
  not been run against the real platform. CI (lint/typecheck/build/audit/tests) remains separate
  from this and already existed.
- **The in-memory cache, rate limiter, and `@Cron` jobs are all single-instance-only.** See
  `docs/DECISIONS.md`'s entry on this — correct only because deployment is explicitly
  single-instance today.
- **A real concurrent-load test (2026-11-16, see `docs/CHANGELOG.md`'s dated entries) found and
  mostly closed this single backend instance's concurrency ceiling against the dev database.**
  Three fixes in sequence: connection pool sizing (`connection_limit` was never set, defaulting to
  9; raised to 60), reducing `AuditService.record`'s own round-trip count, and — the single biggest
  win — an explicit audit-policy decision that routine list/stats filtering is not a "denial" under
  non-negotiable #6 (only a specific request for a case the user can't open is), removing the
  `cases.case.list_filtered` write entirely. After all three: **40 simultaneous `/cases` requests
  from one source succeed with zero failures** (was ~4/10 failing at just 20, before the policy
  fix). Genuine overload beyond the database's real capacity still fails fast with a clean `503 +
  Retry-After` rather than hanging or 500ing (that filter stays regardless of load level).
  **Still real, not eliminated**: `AuditService.record`'s per-tenant `pg_advisory_xact_lock`
  necessarily serializes every audit write for the same tenant — a correctness requirement
  (prevents the hash chain forking), not a bug — and still applies to every `assertAccess`-path
  denial and every other audited action in the app, just no longer on the two highest-traffic
  endpoints. **Update, same day**: a local near-zero-latency proxy test (see `docs/CHANGELOG.md`'s
  5th-pass entry) ran this exact code, same schema/RLS, against a co-located database instead of
  Neon's `us-east-2` over ~230ms RTT — single `/cases` went from ~5.6s to ~19ms, and concurrency
  10/40 that needed up to ~7.5s on the dev setup finished in under 200ms. The database/backend
  layer never became the bottleneck at any concurrency this session could generate from one
  machine; the only thing that did was the *unrelated*, intentionally-configured IP-based rate
  limiter. **This reframes, but doesn't close, the single-instance item above**: today's evidence
  points at latency (now understood, not guessed at) as what was driving the apparent need for
  horizontal scaling, not raw instance capacity — a single, properly co-located instance shows no
  sign of needing a second one yet. Worth re-checking against real projected usage once actual
  numbers exist, before treating Redis/horizontal scaling as the next priority over latency/
  co-location. **Still not done**: the real target topology itself (an actual Render instance +
  an actual Neon project in the same region, a real network hop rather than localhost) — today's
  proxy is a local machine, directionally very strong evidence, not a substitute for that.
- **No regulator-grade audit export** (current export is API-only, capped at 200 rows).
- **No backup/DR operationalization** beyond CD-05/CD-07's paper policy — no restore drill has ever
  been run.
- **No EFIMS-specific incident-response runbook**, no tenant billing/offboarding/data-export flow.
- **Backend has 17 remaining npm production-path vulnerabilities**, all requiring a NestJS 10→12
  major-version bump across nearly every `@nestjs/*` package simultaneously. Deliberately deferred
  as its own dedicated upgrade — **not to be attempted during this hardening pass** (see
  `CLAUDE.md`'s non-negotiable rule #10 for this pass).
- ~~**~27 of 35 reference mockup screens have no corresponding built page**~~ **Re-measured
  2026-11-19, materially better than claimed**: of 33 meaningful mockups (2 are discarded
  alt-palette duplicates), ~11 are solidly built, ~7 are partial (real underlying capability,
  different UX shape than the mockup — e.g. `containment`/`regulatory` are generic registers, not
  the mockups' bespoke consoles/filing generators), and **~15 (~45%) are genuinely not built at
  all** — still a real gap, just a smaller and more accurate one than "~27/35 (~77%)." Ranked by
  how likely a stakeholder is to ask about it, still not started, still awaiting prioritization:
  (1) network graph / entity risk scoring / watchlist / customer 360 — the most visually
  distinctive mockups, zero route exists for any of the three;
  ~~(2) a unified business-value dashboard tying incidents→cases→recovery→CAPA into one
  outcomes/ROI story~~ **Closed 2026-11-19**: added as a third "Outcomes" tab on the existing
  `ExecutiveDashboard` (alongside "Operations"/"Analytics" — additive, since those two already
  covered most of the incidents→cases→recovery ground; CAPA and an explicit lifecycle view were
  the real gaps). Shows: recovery rate (%, real `totalRecovered`/`totalLoss`), case closure rate
  + mean days-to-close (new `CaseStats.meanDaysToClose` field, computed from real `closedAt`/
  `createdAt`), CAPA effectiveness (% completed-or-validated, computed from the existing `/capa`
  register — no new backend endpoint needed), a Signals→Incidents→Cases→Closed lifecycle funnel,
  and a CAPA status breakdown. Deliberately did not use the closest-named mockup
  (`executive-threat-briefing.html`) as a template — it turned out to be a fabricated board
  briefing (fictional "Attack Topography" threat categories, an invented "EFIMS Neural Ingress
  Kernel v4.8" AI brand, Thales HSM/NIBSS telemetry claims), same over-the-top theater problem as
  the MFA mockup — built from this project's real data model instead. Live-verified in a real
  browser as the seeded `EXECUTIVE` user — zero console errors, real computed numbers rendered.
  ~~(3) MFA on login~~ **Closed 2026-11-19**: real TOTP (RFC 6238) MFA shipped — opt-in per user
  (never forced), enroll/confirm/disable self-service flow with a QR code + manual-entry secret,
  10 one-time backup/recovery codes shown exactly once, a dedicated short-lived challenge-token
  second login step (`JWT_MFA_CHALLENGE_SECRET`, separate from the access-token secret), and a
  `/settings/security` page reachable by every role via a new topnav icon. Deliberately dropped
  the mockup's fabricated enterprise theater (Thales Luna HSM, YubiKey/FIDO2 hardware tokens,
  CBN telemetry pipeline, "air-gapped compliance enclave") in favor of the real, honestly-
  buildable standard the mockup itself also cited (RFC 6238) — this project doesn't have a real
  HSM or hardware-token infrastructure, and claiming it would would violate the standing "never
  represent a capability as more than it is" rule. Live-verified in a real browser end to end:
  enroll → scan QR → confirm with a real generated code → backup codes shown once → log out → log
  back in → correctly challenged for a code → verify → disable, zero console errors. One real bug
  found and fixed during verification: the backend's TOTP library threw a 500 instead of falling
  through to backup-code matching when given a non-6-digit input (a backup code looks like
  "A1B2-C3D4", 9 characters) — fixed by only attempting TOTP verification on a 6-digit input.
  ~~(4) bespoke STR/CBN statutory filing-form generators~~ **Closed 2026-11-19**: `RegulatoryObligation`
  gained a real `filingDetails` structured-capture field (STR/SAR: reporting institution, subjects
  of report, grounds of suspicion, transaction schedule; regulator notification: institution,
  classification, narrative, exposure), editable while `PENDING`, plus a standalone
  `/regulatory-preview/[caseId]/[obligationId]` document view with a real "Print / Save as PDF"
  button. Deliberately dropped the mockups' fabricated goAML/CBN-portal transmission,
  cryptographic HSM signing, and biometric OTP sign-off — none of that is real or was scoped in;
  actual filing stays a human action outside EFIMS, same line already drawn for containment and
  evidence. Live-verified twice end to end in a real browser, zero console errors.
  (5) lower-likelihood niche items — alert rule engine, HSM signing enclave, court-ready evidence
  export, law-enforcement liaison, transaction-flow heatmap, rail latency.
  ~~Team-assignment conflict check~~ and ~~system-health telemetry~~ **closed 2026-11-19**: see
  the dedicated entries below — both mockups turned out to be almost entirely fabricated
  infrastructure (PEP/beneficial-ownership screening, fake hardware tokens; a fake 14-node
  Kubernetes cluster with fake HSM/service-mesh metrics, directly contradicting this project's
  own documented modular-monolith architecture), but each had one real, honestly-buildable thing
  underneath, which got built.
- ~~Team-assignment conflict check~~ **Closed 2026-11-19**: `GET /cases/:id/team-conflict-check`
  — before actually assigning a team, checks whether any of its members already carry a
  `SUBJECT`/`CONFLICT` flag on this case (non-negotiable #6) and shows who, with their name and
  reason. Purely advisory, never blocks the assignment — the real access control (denying that
  member individually, regardless of team assignment) was already correct and unchanged; this
  just surfaces it before the fact instead of only at the moment someone tries to open the case.
  Found and fixed a genuinely pre-existing bug while building this (not introduced by this
  change): the team-reassignment `<Select>` was never controlled, so after picking a *different*
  team the trigger fell back to showing the raw team UUID instead of its name — only ever
  noticed because this was the first time anything exercised re-selecting a team through it.
  Live-verified in a real browser: flagging a real team member as CONFLICT, then selecting that
  team, correctly showed "1 of N team members are flagged on this case" with the right name and
  reason.
- ~~System-health telemetry~~ **Closed 2026-11-19**: a real `/settings/system-health` page —
  API/database reachability (`GET /health/ready`, a real `SELECT 1`), audit hash-chain integrity
  (`GET /audit-events/verify`), CD-01..08 ratification count, and real user/team counts. No
  fabricated CPU/RAM/IOPS/pod metrics, no fake microservice names — nothing on this page is a
  number this app can't actually produce. **Found a real, separate issue while verifying it
  live**: `verifyChain` has no pagination and took 30+ seconds against today's session's own
  accumulated audit-event volume, risking a timeout for any caller (not just this new page,
  which degrades gracefully when it happens — the existing Audit page's own verify button would
  hit the same thing). Worth a real fix later (paginate, or verify incrementally from a last-
  known-good checkpoint instead of the full table every time) — not fixed now, flagged here.
- **The `efims_test` database was missing migrations — twice now, same root cause both times.**
  First found 2026-11-14 (`20261110161528_tasks`, `20261111191838_incident_ai_risk_factors`),
  fixed by re-running `npm run test:e2e:setup-db`, with a note that this would recur without an
  automated check. It recurred 2026-11-19 with two more (`20261116104932_push_subscriptions`,
  `20261118153708_ml_prediction_records`) — found when a full production-readiness audit
  actually ran the e2e suite and it failed. Applied both this time too. **Still not actually
  fixed at the root**: nothing in this repo re-applies pending migrations to `efims_test`
  automatically, or even checks/warns that it's behind, when a new migration ships. A
  `prisma migrate status` check against the test DB added to the e2e npm script (or a
  pre-test-run step) would close this for good instead of relying on someone noticing again.
- **`tenant-isolation.e2e-spec.ts` times out in its own `beforeAll`** (10-minute Jest hook timeout,
  reproduced twice, including once in full isolation from every other spec file), with a Prisma
  "transaction not found" error inside `ApprovalService.decide` during the heavy two-tenant HTTP
  bootstrap fixture. Not a logic regression — confirmed by (a) `ApprovalService.decide` being
  unmodified code, (b) the other 5 e2e suites (including `case-access-matrix`, which exercises much
  of the same access-control code) passing cleanly, and (c) a fast, direct, targeted recheck of
  the actual non-negotiable #5 guarantee against the real dev database (`efims_app` role, no
  tenant context set → 0 rows; `bank-1` context set → real rows) passing instantly. Reads as a
  genuine Neon connection/transaction-handling issue specific to this heavy fixture under current
  conditions, not something this pass's changes caused — flagged here rather than silently
  re-run-until-green, since that wouldn't explain why it's timing out. **New diagnostic detail,
  2026-11-19**: re-ran as part of a 4-way production audit (after fixing the two real bugs above
  that were separately breaking all 6 suites) — same timeout, but this time with a concrete error
  underneath it: `Transaction API error: Transaction not found... refers to an old closed
  transaction`, thrown from `CasesService.findOrThrow` (called via `RegulatoryService.
  createObligation` during the heavy two-tenant `bootstrapTenant` fixture). Consistent with the
  existing theory (a Prisma interactive transaction outliving Neon's own idle/pooler timeout
  under this fixture's load) — now with a specific call site to start from whenever this gets a
  real root-cause pass, rather than only a timeout with no further clue. Confirmed this is the
  ONLY suite still failing: all other 5 (audit-integrity, case-access-matrix, containment-gate,
  auth, ai-advisory-boundary) now pass completely — 30/36 tests — once the two bugs above were
  fixed and the test DB's migrations were current.

- **NEW, found and fixed 2026-11-19**: the e2e suite's documented status ("36 tests, ~65%
  coverage") was false in a way neither of the two items above explains — it didn't compile at
  all, for an unrelated pre-existing reason: `CasesService.list()`'s `Promise.all` produced
  ambiguous tuple inference only ts-jest's config caught (`tsc --noEmit` on the main build stayed
  clean). Fixed with explicit types. Getting the suite to actually run surfaced two more real,
  previously-invisible bugs, both fixed same day: `NotificationsService`'s ESM dynamic import for
  `web-push` ran eagerly in the constructor (crashing instantly under Jest, since every spec
  boots the app) — deferred to first actual push send; and `test/e2e/.env.test` never overrode
  `ML_SERVICE_BASE_URL`/`ML_SERVICE_API_KEY`/VAPID keys, so e2e runs were silently falling back to
  the real `.env` — harmless before the real AI service integration landed, a real live-vendor-
  call risk after. Full writeup in `docs/CHANGELOG.md`'s 2026-11-19 (cont'd) entry.
- **NEW, found 2026-11-19, not fixed (small, tracked for later)**: `RecoveryService.predictRecovery`
  reads `tx.containmentRequest.findFirst(...)` directly instead of through a `ContainmentService`
  public method — a real non-negotiable #2 violation, pre-existing since 2026-11-14, previously
  unflagged. Same shape as the Track-A2 items already listed in the backend-hardening plan
  (`CasesService.stats()`'s direct ledger/approval queries) — should be fixed alongside those,
  not as a one-off.

## Smaller, pre-existing, explicitly deferred follow-ups

- No generic capability/permission-string engine — `Role` stays a flat scalar enum (20 values).
  See `docs/DECISIONS.md` — this is a documented future seam, not an oversight, though its priority
  has risen now that the enum has grown this large.
- No access-recertification campaigns (periodic review of who holds what role/compartment grant).
- No real invite-link flow for new users (accounts are currently created directly by an admin).
- The density/mono (forensic-identifier monospace styling) visual roll-out only reached Audit,
  Cases, and the Executive dashboard as a representative pass — the remaining list pages and 16
  other role dashboards inherit the new color tokens automatically but not the literal
  density/radius/mono class changes yet.

## Explicitly not started, pending prioritization

- Billing/subscription design for real multi-tenant commercial operation has not been started at
  all — the platform layer can provision/suspend a tenant, but there is no concept of a plan,
  invoice, or usage metering anywhere in the system.
- Penetration testing has not been performed.

---

## Baseline — recorded 2026-11-10, start of the production-hardening pass

Freshly re-run at the start of this pass (not restated from memory), so later phases can be
measured against a known, verified starting point.

### Backend (`efims-backend/`)

- `npx tsc --noEmit`: **clean, 0 errors.**
- `npm run lint`: **1 warning, 0 errors** — `src/modules/audit/audit.service.ts:161`, `'actor' is
  defined but never used`. Pre-existing, not introduced by this pass; left as-is since Phase 0 is
  baseline-recording only, not fixing.
- `npm run build` (`nest build`): **succeeds.**
- `npm audit --omit=dev`: **17 vulnerabilities (5 high, 12 moderate), 0 critical.** All three
  flagged packages (`multer`, `qs`, `uuid`) only have a fix path via `npm audit fix --force`, which
  would install `@nestjs/platform-express@12.4.2` and `@nestjs/schedule@12.0.3` — i.e. the same
  NestJS 10→12 major-version bump this pass is explicitly not attempting (rule #10). Matches the
  previously-documented count exactly.

### Frontend (`efims-frontend/`)

- `npx tsc --noEmit`: **clean, 0 errors.**
- `npx eslint src --max-warnings=0`: **clean, 0 warnings, 0 errors.**
- `npm run build` (Turbopack production build): **succeeds** — all 31 routes build correctly
  (dynamic server-rendered routes for every data-backed page, static prerender for `/login` and
  `/platform/login`).
- `npm audit --omit=dev`: **0 vulnerabilities.**
