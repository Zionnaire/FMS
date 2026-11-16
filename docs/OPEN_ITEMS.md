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
- **The ML engineer's real inference API is not yet delivered.** `ml-gateway` currently calls Groq
  directly as a temporary development adapter, intended for synthetic data only. The hardening plan
  restructures this module contract-first (an OpenAPI spec) so swapping Groq for the real service
  requires a configuration change, not a code change — but until that real service exists and is
  integrated, no AI capability in this system should be exercised against real bank data.
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
- **~27 of 35 reference mockup screens have no corresponding built page** (MFA, whistleblower
  portal, network graph, STR form generator, alert rule engine, and others). Some may be
  deliberately out of scope; not yet confirmed one by one. A full mapping (built / deferred-with-
  reason / cut) is a tracked deliverable of the hardening plan's later phases.
- **The `efims_test` database was missing two migrations** (`20261110161528_tasks`,
  `20261111191838_incident_ai_risk_factors`) — found 2026-11-14 when the e2e suite's
  `ai-advisory-boundary` spec failed on a column that genuinely didn't exist in that database,
  unrelated to any code change. Fixed by re-running `npm run test:e2e:setup-db`. **Worth adding to
  this suite's own CI/setup docs**: nothing currently re-applies pending migrations to
  `efims_test` automatically when a new one ships — this will recur the next time a migration is
  added without a matching `test:e2e:setup-db` run.
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
  re-run-until-green, since that wouldn't explain why it's timing out.

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
