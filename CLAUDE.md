# EFIMS — Project Context

**EFIMS** = Enterprise Financial Crime & Incident Orchestration Platform.
A multi-tenant SaaS for banks (Bank 1 is the first tenant) to manage fraud/incident intake,
triage, case investigation, containment, recovery, CAPA, regulatory reporting, and audit —
with AI used only in an advisory, human-overridable capacity.

This file is the always-loaded entry point. Full detail lives in `docs/`:

- [docs/architecture.md](docs/architecture.md) — MVP system design: stack, module structure, data model, tenancy, security, deployment.
- [docs/design-system.md](docs/design-system.md) — "Botanical Executive" design tokens, component specs, Storybook stories.
- [docs/configuration-decisions.md](docs/configuration-decisions.md) — CD-01–CD-08 working-default configuration values (taxonomy, severity, SLA, approvals, retention, migration, RTO/RPO, AI release scope).
- [docs/CHANGELOG.md](docs/CHANGELOG.md) — running build log. **Update this whenever a decision changes, a module ships, or a doc is revised.**

## Confirmed MVP toolset

- **Frontend:** Next.js (App Router) + TypeScript + Tailwind + shadcn/ui. Talks to backend only via REST. No direct DB or AI access.
- **Backend:** NestJS/TypeScript, modular monolith (not microservices) on Render.
- **Database:** PostgreSQL (Render-managed), Row-Level Security enforcing tenant isolation at the engine level.
- **AI:** The EFIMS AI Service (a separate Python/FastAPI application, severity/anomaly/recovery models) is the primary provider; Groq is kept as an automatic severity fallback plus the sole engine for duplicate/correlation detection. Both called only through the backend's `ml-gateway` module — no other code path may call either.
- **Deferred until a phase needs them:** Redis, Kafka/RabbitMQ, Temporal, OpenSearch, Neo4j, Kubernetes. See `docs/architecture.md` §6 for trigger conditions.

## Non-negotiables (carried into every phase, not just MVP)

1. **Signal → Incident → Case** are three distinct entities, never collapsed into one table/concept.
2. **Modules talk only through their own public service interface or an in-process event emitter** — never by reaching into another module's tables directly.
3. **`audit` module is write-only from the outside** — append-only, no update/delete path for any audit row, including via raw SQL.
4. **`ml-gateway` is the only module allowed to call any external AI/ML provider.** The EFIMS AI Service is the source of truth for everything it covers (severity, anomaly scoring, recovery prediction); Groq is kept only as (a) an **opt-in-only** fallback for severity when the EFIMS AI Service is unreachable or an incident is missing the risk-factor fields it needs — changed 2026-11-14 from "automatic" to opt-in, since an LLM-generated label isn't a validated predictive classifier and should never silently stand in for one; the caller must explicitly request it (`allowLlmFallback`/"Try an LLM-estimated severity instead" in the UI), not have it happen by default — and (b) the sole engine for duplicate/correlation detection, which the EFIMS AI Service doesn't cover at all (no opt-in needed there, since no structured alternative exists to silently bypass). No autonomous adverse action (containment, write-off, disciplinary action, regulatory submission) ever fires without a human approval step, and no AI suggestion from either provider is ever auto-applied — every one is advisory only.
5. **Tenant isolation is enforced twice**: application-layer tenant-context middleware sets the active tenant per request, and Postgres RLS is the backstop (`tenant_id = current_setting('app.current_tenant')` on every tenant-scoped table).
6. **Case access requires ALL of:** tenant match, role permission, team match (or elevated role), user not a subject/conflict on the case, user clearance ≥ case sensitivity, case compartment ∈ user's authorised compartments. Any denial is itself written as an audit event.
7. **Compartments from day one:** `STANDARD`, `AML_MLRO`, `WHISTLEBLOWING` (reporter identity in a separate vault from case content), `LEGAL_PRIVILEGE`, `HR`, `EXECUTIVE`.
8. **Containment is confirmation-gated:** EFIMS never shows a case as "contained" until a positive `ActionConfirmed` comes back from the source system. EFIMS never freezes an account or blocks a card itself — it only requests and waits.
9. **CD-01–CD-08 values in `docs/configuration-decisions.md` are working defaults for build purposes, not yet formally ratified policy.** Don't represent them externally (to a bank, regulator, or stakeholder) as signed-off. See that doc's ownership table for who actually signs each one off.

## MVP build order

`identity` → `configuration` → `incidents` → `triage` → `cases` → `workflow` → `audit`, then evidence/containment/recovery/CAPA/regulatory/notifications once the core incident-to-case flow works end-to-end.

**Status: the entire backend named in architecture.md's module map is built.** Every module —
`identity`, `configuration`, `incidents`, `triage`, `cases`, `workflow`, `audit`,
`notifications`, `investigations`, `evidence`, `containment`, `recovery`, `capa`, and
`regulatory` — is scaffolded, migrated, RLS-applied, and **live-verified end to end against a
real Postgres database (Neon)** in `efims-backend/`. So is the cross-cutting infrastructure pass
run alongside them: rate limiting, in-memory caching (Redis deliberately still deferred — see
architecture.md §6's own trigger condition), security headers/CORS, health checks, pagination,
an in-process event bus, and a JWT-authenticated Socket.IO real-time gateway (two real websocket
clients received live pushes with no poll/reload). This satisfies the explicit request to have
the full backend production-ready before any frontend work starts.

Live verification consistently covered the same ground for every module: the full 7-condition
case-access rule (non-negotiable #6) and RLS tenant isolation confirmed directly against the
database (an `efims_app` session with no tenant context set sees zero rows even when real rows
exist), CD-04's approval gate enforced wherever CD-04 actually names an action (`containment`'s
`CONTAINMENT`, `recovery`'s `LOSS_WRITE_OFF`, `regulatory`'s `REGULATORY_SUBMISSION` — each via
the same reusable `ApprovalService.assertApproved`, non-negotiable #4's "no autonomous adverse
action without a human approval step" enforced in one place, not scattered per-module), and every
access denial written as an audited event. Real bugs were found and fixed live along the way —
most notably an approval-reuse gap `containment` found (the same approved sign-off could
authorize an unrelated second action), fixed with a database-level unique constraint and then
built in from the start for `recovery` and `regulatory` rather than rediscovered. `evidence` and
`containment` are deliberately not autonomous actors: `evidence` holds a hash + external pointer,
never file content (no blob storage exists yet); `containment` only ever requests and waits for
a source-system confirmation (non-negotiable #8), never acts itself.

Full specifics, what's built vs. deliberately deferred per module, and every bug found along the
way live in each module's own section of `efims-backend/README.md` and in `docs/CHANGELOG.md`'s
dated entries (2026-09-18 through 2026-09-24).

**Frontend status: full module coverage is built** in `efims-frontend/` (Next.js 16 App Router +
TypeScript + Tailwind v4 + shadcn/ui — note Next.js 16 has real breaking changes from older
versions, e.g. `middleware.ts` → `proxy.ts`; see that project's own README and its bundled
`node_modules/next/dist/docs/` before assuming familiar APIs still apply). Built: the full
auth/session architecture (httpOnly-cookie session holding the backend's own JWTs verbatim, a
self-contained `proxy.ts` for optimistic route gating + silent token refresh, Server Actions for
every write, real authorization left entirely to the backend on every request — no authorization
logic duplicated in the frontend), the dashboard shell, and a real page for every backend module:
`signals` (queue, intake, validate/reject), `incidents` (list, detail — triage, SLA clock,
relate/merge), `cases` (list, create, and a tabbed detail view covering Approvals, Investigations,
Evidence, Containment, Recovery, CAPA, Regulatory), `audit` (read-only trail), `configuration`
(read-only CD-01..CD-08), and `notifications`. Live-verified end to end in a real
headless-Chromium browser session against the real running backend, one continuous flow through
real data: signal → incident → triage → SLA clock → case → subject flag → approval request →
self-approval correctly rejected (segregation of duties) → investigation plan → evidence →
recovery loss → CAPA/Regulatory tabs → containment guard message → audit trail → configuration →
notifications — zero console errors across the whole pass. See `efims-frontend/README.md` for the
full architecture writeup and module status table, and `docs/CHANGELOG.md`'s dated entries for
specifics.

Building and verifying this surfaced four real bugs, all fixed live (full detail in
`efims-frontend/README.md`'s "Real bugs this build found" section): a CD-01 seed-data quality bug
(an explanatory aside baked into a literal taxonomy type-name string), a blank-dashboard-page bug
(sequential uncached fetches with no loading state — fixed with `Promise.all` + `loading.tsx`), a
signal-validate redirect bug (the frontend mistyped the backend's `Signal` response as an
`Incident` and redirected using the signal's own id instead of its `incidentId` field, 404-ing
every incident reached that way), and a missing shared error boundary (`(app)/error.tsx`, added
so an uncaught `ApiError` shows a graceful in-app message instead of Next.js's raw dev overlay).
One additional finding was confirmed as **correct, not a bug**: flagging the only seeded user as a
case `SUBJECT` correctly locks that same user out of the case per non-negotiable #6 — the fix was
to the verification script (create a disposable second test user), not the app. Three small
backend endpoints were added to support this frontend surface: `GET /cases/:id/flags`,
`GET /cases/:id/status-history`, and `GET /users` (open to any authenticated user, used for
name-lookup dropdowns).

**2026-09-30 — visual density pass.** The user compared the shipped frontend against
`mockups/screens/*.html` directly and found it functionally complete but visually a plain MVP
skeleton next to the mockups' KPI-hero/dense-filter/tabbed-dossier density. Cases, incidents,
signals, and audit list pages were rebuilt with real KPI hero rows (backed by new `GET .../stats`
endpoints — never fabricated numbers, same standing rule as the CD-01 dashboard fix), richer
filter bars, and denser table rows; the case-detail layout gained a real hero header + stats
ribbon and properly active-highlighted tabs. Full detail, and the specific mockup elements
deliberately dropped for having no real backing field (fictional jurisdictions, payment rails,
Nigeria-specific regulatory copy), are in `docs/CHANGELOG.md`'s 2026-09-30 entry.

**Audit hash-chain bug — root-caused and fixed.** Reviewing the redesigned audit page surfaced a
broken tamper-evidence hash chain. Dug in per explicit request: `configuration.ratify` and
`regulatory.obligation.create` both put a live JS `Date` into audit `metadata` instead of a
string; `audit-hash.ts`'s `canonicalize()` had no case for `Date` (which has zero own enumerable
properties), so it silently hashed as `{}` at write time — permanently disagreeing with the ISO
string `verifyChain` reads back after the JSONB round-trip. Fixed in `canonicalize()` itself (the
one shared hash function), confirmed live by writing a fresh event through the fixed path and
re-verifying. `verifyChain` also no longer stops at the first break — it now surfaces every
break's action/entity/date/reason instead of hiding everything past the first one. The 3
already-written broken rows (all dated 2026-09-24, all explained by this same bug) were
deliberately left untouched: `audit_events` revokes UPDATE/DELETE from the app's DB role at the
grant level, belt-and-suspenders for non-negotiable #3, and rewriting a hash chain to make it
re-verify — even to fix a real bug — is indistinguishable in principle from rewriting it to hide
tampering. Full incident writeup in `docs/CHANGELOG.md`'s 2026-09-30 entry.

**2026-10-14 — 20-role RBAC expansion + new platform/super-admin layer.** The per-tenant `Role`
enum grew 8 → 20 values (still a flat scalar on `User`, not a many-to-many Role/Permission model —
that stays the schema's documented future seam), each with a real, backend-data-driven dashboard
and sidenav scoping grouped under Monitor/Manage/Govern. `UserCompartmentGrant` gained
`expiresAt`/`revokedAt` (temporary/expiring grants), and a new `AccessChangeRequest` model/service
added maker-checker for role/compartment changes, reusing `ApprovalService`'s proven
requester-cannot-decide-own-request pattern. Tenant-scoped `ADMIN`'s existing blanket bypass is
**unchanged** — deliberately: the single seeded admin user is what every verification pass in this
project has relied on, and `Role` being scalar means that user can't also hold a business role. The
user's real ask — a properly separate administrative tier with no default business-content access —
now lives one level up instead: a brand-new **platform layer**, entirely outside any tenant. A
`PlatformUser` (not a `Role` value, no `tenantId`, not RLS'd) gets its own JWT secret, its own
guard, and its own login/session, so a bug in the per-tenant RBAC system structurally cannot grant
platform power. It can list every tenant, provision a genuinely new one (parameterized version of
`seed.ts`'s bootstrap, extracted into one shared function so the demo seed and real provisioning
never diverge), and suspend/reactivate tenants — a real, working second step toward actual
multi-tenancy, not just a renamed admin. Two real bugs were found live and fixed: `CapaService`
had no check stopping an action's own owner from validating their own work (fixed, mirroring the
existing approval segregation-of-duties pattern), and the create-tenant form's slug input pattern
threw a genuine browser console error under newer Chromium regex parsing. Final regression also
surfaced (and fixed) stale test data — not a code bug — shadowing the real CD-01 incident
taxonomy as "current." Full detail, the explicit in-scope/out-of-scope decisions, and the final
19-step regression pass are in `docs/CHANGELOG.md`'s 2026-10-14 entry.

**2026-10-29 — three deferred follow-ups shipped.** Triggered by two real bugs the user hit live
while validating a signal: a free-text taxonomy field with no indication of valid values ("Theft"
rejected with nothing to go on), then a controlled/uncontrolled `Select` warning from fixing the
first one (`useState<string | undefined>(undefined)` renders uncontrolled on first paint — fixed by
initializing to `""`). Both fixed, then scoped into building the three items the previous entry's
"Next" section had explicitly deferred: **real-time notifications** (backend needed no changes —
its realtime gateway already pushed `notification.created` live; the frontend just never
connected — added `socket.io-client`, a `NEXT_PUBLIC_REALTIME_URL` env var as the one deliberate
exception to "the browser never talks to the backend directly" since a push channel can't be
proxied through a Server Action, and a shared hook used by both the notifications list and the
topnav badge); a **user-management UI** (`/users` list/create/detail + a tenant-wide access-change
inbox, built entirely around the backend's existing maker-checker request/decide flow since there's
deliberately no direct endpoint to change a role or grant a compartment, gated `ADMIN`-only); and
**inline per-field validation** (one shared parser turning the backend's class-validator messages
into field-level errors, applied to every data-entry form in the app — new user-management forms,
signals, case creation, and all seven case-detail tabs). Live-verified together: realtime push
arriving with zero reload, the full maker-checker flow including a second admin deciding a
different admin's request, and inline errors rendering for a duplicate email and a bad taxonomy
value. Final regression — the full admin-driven signal-to-notifications flow, now also covering
`/users` — passed all 20 steps with zero console errors. Full detail in `docs/CHANGELOG.md`'s
2026-10-29 entry.

**2026-11-02 — production-readiness audit + security patches.** User asked for a full gap analysis
against "full production grade." Three parallel audits (backend, frontend, infra/compliance) found
real, evidence-backed gaps — most notably: **zero automated tests in either app** (every
"live-verified" claim this whole project has made was a manual Playwright/curl script, never
committed), **`ml-gateway` doesn't actually exist** (CLAUDE.md's AI claim is aspirational), **no
deployment pipeline** (no Dockerfile/render.yaml/CI anywhere despite "deployed to Render"), **all 8
CDs still unratified**, **the in-memory cache/rate-limiter/cron jobs are single-instance-only**
(becomes a real correctness bug the moment a second backend instance exists), plus no regulator-
grade audit export, no legal/compliance docs, no backup/DR operationalization, and ~27 of 35
mockup screens with no corresponding page. Full list given to the user; **they chose to start with
security patches only** — everything else above is a confirmed, real gap, not yet started, and
should stay that way until the user prioritizes it (don't assume "production-grade" means fixing
all of it unprompted).

**Security patches applied**: frontend had 18 production-path npm vulnerabilities including a
**critical unauthenticated Next.js RCE** — root cause was `shadcn` (a dev-only CLI tool) sitting in
`dependencies` instead of `devDependencies`, pulling its whole build-tool tree into the audit scope;
fixed by moving it, upgrading `next` 16.3.6→16.4.3 and `zod`→^4.6.7, now **0 production-path
vulnerabilities**. Backend's one critical (`handlebars`, via `@nestjs/cli`, build-time only) is
fixed; the remaining 17 all require a NestJS 10→12 major bump across nearly every `@nestjs/*`
package at once — deliberately deferred as its own dedicated upgrade, not bundled into a patch
sweep. Also added real login brute-force throttling (`@Throttle()` was referenced in a comment but
never actually used anywhere) on both the tenant and platform login routes, live-verified (6th
attempt in 60s correctly 429s). Fixed one stale doc comment claiming the user-management UI doesn't
exist (it shipped in the entry above). Full detail in `docs/CHANGELOG.md`'s 2026-11-02 entry.

**2026-11-10 — design system blend + the first real `ml-gateway`.** User pushed back on the
2026-11-02 audit, unconvinced the product solves the problem it's named for (zero AI anywhere in a
system whose name promises "Intelligence") and dissatisfied with the design (doesn't read as
analytical, flat IA, polish). Both addressed together: **design** — blended the shipped "Botanical
Executive" with a second, fully-specified design system found already sitting in the mockups
(`mockups/design-tokens/efims-vanguard-precision.md`, built for exactly this forensic/analyst feel
but superseded before most pages used it) — cooler Vanguard surfaces, Botanical's spruce-green kept
as the one warm accent, Playfair headlines kept, severity tokens fixed to 4 distinct colors (was a
real S2=S3 bug). Added genuinely new structure that didn't exist before: global Ctrl+K search, the
app's first real charts (an outcome trend on Audit, a severity trend on the Executive dashboard),
and a quick-preview detail drawer on Cases. **Intelligence** — built the real `ml-gateway` module
for the first time (previously zero lines of code despite being named in this file since the
start), implementing exactly CD-08 Phase 2: an advisory, read-only severity suggestion and a
duplicate/correlation detector, both using Groq via the OpenAI-compatible `openai` SDK, both
degrading to a clean 503 (not a crash) when unconfigured. Caught and fixed a real non-negotiable #2
violation before it shipped: the severity-trend chart's data query was first written directly
inside `IncidentsService` against a table (`TriageAssessment`) it doesn't own — moved to
`TriageService` using a new cross-module `IncidentsService.getVisibleIncidentIds` read, mirroring
`CasesService.getVisibleCaseIds`'s established pattern. Full regression re-run clean (20/20 steps,
zero console errors). Full detail and what's explicitly deferred (the much larger mockups needing
entirely new domain models — network graph, entity risk scoring, customer 360, alert rules — and
CD-08 Phase 3+) are in `docs/CHANGELOG.md`'s 2026-11-10 entry.

**2026-11-10 (cont'd) — real Groq key verification, two real bugs found and fixed.** User supplied
a real `GROQ_API_KEY`. Verifying against it (not just the configured/unconfigured code paths above)
found: (1) `GROQ_MODEL` was hardcoded to `llama-3.3-70b-versatile`, which Groq has since removed
from its catalog — both endpoints 500'd until switched to `openai/gpt-oss-120b` (queried Groq's own
`/v1/models` list with the real key to find a currently-servable one); confirmed live afterward with
real, sane output (a 92%-confidence S4 suggestion for a no-loss test incident, a similarity scan
correctly scoring true near-duplicates at 0.99 vs. 0.40–0.55 for same-category-only matches). (2) A
real bug in `SimilarIncidentsPanel`: its inline Relate/Merge buttons could get stuck disabled
forever even though the backend write had already succeeded — a Server Action invoked directly from
a Client Component (not via `<form>`) races its own `revalidatePath` against a local
`setState`/`.filter()` update, and the local update could get silently lost. Fixed by re-fetching the
similarity list from the backend in a `finally` block instead of trusting local state — slower
(~15–20s combined per action, since the full candidate set re-scores via Groq again) but correct and
self-healing regardless of the race. Full detail in `docs/CHANGELOG.md`'s dated follow-up entry.

**Next**: the full production-readiness gap list from 2026-11-02 is still the real backlog —
automated test infrastructure is probably the single highest-leverage next step, but nothing in
that list should be started without the user picking it. Smaller pre-existing follow-ups, still not
started: a generic capability/permission-string engine (Role stays flat for now),
access-recertification campaigns, a real invite-link flow for new users, and finishing the
density/mono roll-out across the remaining list pages and role dashboards (Audit/Cases/Executive
got the representative pass; the rest inherit the new color tokens automatically but not the
literal density/mono changes yet).

## Working agreement

Whenever a build session changes an architectural decision, ships a module, revises a CD value, or otherwise makes something in `docs/` stale, update the relevant doc **and** add an entry to `docs/CHANGELOG.md` in the same session — don't let these drift from the actual code.
