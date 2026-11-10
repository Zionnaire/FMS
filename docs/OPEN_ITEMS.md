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

- **Zero automated tests in either app.** Every "live-verified" claim in this project's history to
  date is a manual Playwright/curl script run from a scratch folder, never committed to the repo.
- **No deployment pipeline** — no `Dockerfile`, `render.yaml`, or CI/CD anywhere, despite being
  described as "deployed to Render."
- **The in-memory cache, rate limiter, and `@Cron` jobs are all single-instance-only.** See
  `docs/DECISIONS.md`'s entry on this — correct only because deployment is explicitly
  single-instance today.
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
