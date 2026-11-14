# EFIMS Backend

NestJS modular monolith. See [`../docs/architecture.md`](../docs/architecture.md) for the full
module map and non-negotiables; this README only covers running what's built so far.

**Built so far:** `identity` (auth, users, teams), `configuration` (CD-01..CD-08 versioned
values), `incidents` (Signal intake/triage, Incident, whistleblower identity vault), `triage`
(severity/routing assessment, escalation), `cases` (case record, the full 7-condition access
rule, team, status history), `workflow` (SLA clocks, CD-04 approval matrix), `audit` (a
per-tenant tamper-evident hash chain plus an oversight-only query/verify API), `notifications`
(templates, delivery, escalation — stubbed external channels, real in-app + live push),
`investigations` (plans, issues, interviews, findings), `evidence` (vault, hashing, custody,
legal hold), `containment` (action requests, confirmations), `recovery` (loss/recovery ledger,
reconciliation), `capa` (root cause, actions, validation), and `regulatory` (obligations
register, submissions). **This is every module architecture.md's module map names — the entire
MVP build order is now built, migrated, RLS-applied, and live-verified end to end.** See
[`../CLAUDE.md`](../CLAUDE.md).

**Cross-cutting infrastructure** (not a build-order module, added across all of the above): rate
limiting, in-memory caching, security headers/CORS, health checks, pagination, a real-time
Socket.IO gateway, and an in-process event bus wiring `workflow`/`cases` to `notifications`. See
its own README section below for what's actually built vs. deliberately deferred.

## Setup

Any real Postgres works — local, Render, Neon, etc. This project's own dev/verification pass
used Neon's free tier; steps below note where a pooled connection (Neon's `-pooler` hostname, or
any PgBouncer-fronted setup) needs extra care.

1. `npm install`
2. Copy `.env.example` to `.env`. Fill in `DATABASE_URL` pointed at a **privileged, migration-
   owning role** — a local Postgres superuser, or a hosted provider's default role if it has
   `CREATEROLE`+`CREATEDB` (Neon's default role has both, without being a true superuser — that's
   actually the right shape, since it still can't bypass RLS). If `DATABASE_URL` is a **pooled**
   connection, also fill in `DIRECT_URL` with the same database's **unpooled** host — Prisma
   Migrate needs a direct connection for advisory locks (see `.env.example`'s comment; Neon
   exposes both as separate hostnames, `-pooler` vs. not). If your connection isn't pooled, set
   `DIRECT_URL` to the same value as `DATABASE_URL`.
3. `npm run prisma:migrate:dev -- --name init` — creates the schema from `prisma/schema.prisma`.
4. `npm run db:rls` — creates the `efims_app` role and applies every RLS policy from
   `prisma/rls-policies.sql`, using whatever privileged role `DATABASE_URL` currently points at
   (`CREATE POLICY`/`CREATE ROLE` are not `efims_app`'s own privileges — it's deliberately
   `NOCREATEROLE NOCREATEDB`). The script's own `CREATE ROLE` uses a placeholder password —
   **immediately rotate it** (`ALTER ROLE efims_app PASSWORD '<something real>'`, then update
   `DATABASE_URL` to match) before using this anywhere reachable off your own machine. Some
   hosted providers (Neon included) reject a genuinely weak password outright at role-creation
   time, which is exactly why the script's placeholder isn't literally `"changeme"` — see the
   comment above the `CREATE ROLE` statement in `rls-policies.sql`.
5. Switch `DATABASE_URL` to connect as `efims_app` with its real (rotated) password — **this
   matters**: table owners and superusers bypass RLS regardless of how many policies exist. Leave
   `DIRECT_URL` on the privileged role permanently — only it can run future migrations.
6. `npm run seed` — creates tenant `bank-1`, an admin user
   (`admin@bank1.efims.local` / `ChangeMe123!`), CD-01..CD-08 as unratified DRAFT v1 rows
   (the working defaults from `../docs/configuration-decisions.md`, transcribed verbatim), and 2
   demo Signal→Incident pairs (one STANDARD fraud incident, one WHISTLEBLOWER incident with its
   vault entry), one demo triage assessment (S2, 24x7 calendar) on the STANDARD incident, one demo
   Case (linked to the STANDARD incident), one demo SLA clock + approved `CASE_CLOSURE`
   request that together close it (`CASE-2026-0001` ends up `CLOSED`), one demo investigation
   plan (v1), a resolved issue, an interview, and a finding, one demo evidence item (hashed,
   with COLLECTED/VIEWED/HASH_VERIFIED custody events), one approved `CONTAINMENT` request
   with a `CONFIRMED` containment action (a card block), a loss/recovery/write-off ledger
   (₦450,000 loss, ₦150,000 chargeback recovery, ₦300,000 approved write-off — outstanding ₦0),
   a root cause analysis with one CAPA action taken through its full lifecycle to `VALIDATED`
   (`EFFECTIVE`), and a regulatory obligation (an STR/SAR filing) taken through its full
   lifecycle to `ACKNOWLEDGED` — all on that same case, `CASE-2026-0001` — the WHISTLEBLOWER
   incident is left un-linked and un-triaged on purpose, so the seed data spans every stage (raw
   signal, triaged incident, linked, closed, investigated, evidenced, contained, reconciled,
   remediated, reported case) rather than everything pre-processed. Change that password before
   this touches anything but a local dev database. The script itself uses `DATABASE_URL`/
   `DIRECT_URL` the same way the app does — see its own module doc comment for why it needs both.
   Its whole tenant-scoped seed runs inside one `prisma.$transaction`, whose `timeout` has
   already been bumped once (30s → 90s) as more modules' worth of data joined it — a real live
   failure (`P2028 Transaction already closed`), not a hypothetical one; it held for every module
   added after that bump, through the last one in the MVP build order.
7. `npm run start:dev`

**If `npm run start:dev` crashes immediately with `Cannot find module '.../dist/main'`** right
after logging "Found 0 errors. Watching for file changes." — seen live on this project's own dev
machine (Windows) — it's `nest start --watch`'s run step racing its own webpack write, not an
application bug. Work around it with `npm run build && npm start` instead (a one-shot compile
followed by running the compiled output directly, sidestepping the watch-mode race entirely);
re-run `npm run build && npm start` again after each further code change instead of relying on
watch mode, until this is worth actually debugging.

**If `npm run build` exits 0 with no output and `dist/` still doesn't exist afterward** — also
seen live on this project's own dev machine — it's a stale TypeScript incremental-build cache:
`tsconfig.tsbuildinfo`/`tsconfig.build.tsbuildinfo` (`"incremental": true` in `tsconfig.json`) can
end up recording that every source file is already compiled (by content hash) even after `dist/`
itself was deleted out from under it (by `nest-cli.json`'s own `deleteOutDir: true`, an interrupted
build, or a manual `rm -rf dist`), so `tsc` silently emits nothing on the next build — it isn't
lying, it genuinely believes there's nothing new to compile. Fixed structurally, not just
documented: `package.json`'s `prebuild` script deletes both `.tsbuildinfo` files before every
`npm run build` runs, so this can't recur silently. If you ever bypass `npm run build` and call
`nest build`/`tsc` directly, delete those two files yourself first if you hit this.

## A hard rule for pooled connections (Neon/PgBouncer): never `set_config(..., false)` outside a transaction

Proven live during this project's own Neon verification, not a theoretical warning: setting
`app.current_tenant` at **session** scope (`set_config(key, value, false)`) on a connection that
goes through a connection pooler leaked that value to a **completely unrelated later client**
reusing the same pooled backend connection — a real cross-tenant exposure, caught only by
testing against an actual pooled endpoint, never by local Postgres or static analysis. It's why
`prisma/seed.ts` had to be rewritten (see its module doc comment) and why the one rule for this
codebase is: **always `set_config(..., true)` (transaction-local), always inside a
`$transaction`.** `PrismaService.withTenant`/`forCurrentTenant` already do this correctly — the
rule is for anyone writing raw SQL against this database directly (seed scripts, one-off
migrations, manual `psql` sessions), not for anything going through those two methods.

If you're debugging via `psql` directly against a pooled endpoint and use `false` for
convenience in one query, immediately reset it afterward
(`SELECT set_config('app.current_tenant', '', false);`) — and be aware a single reset may not
be enough, since the pooler can hand you a *different* leaked backend connection each time;
repeat it a few times and re-verify with an unscoped `SELECT count(*)` before trusting the
database is clean again.

**Related, also latency-driven**: `PrismaService.withTenant` raises `$transaction`'s
`maxWait`/`timeout` well past Prisma's defaults (2s/5s) — against a real remote database, the
defaults failed under perfectly ordinary load (`"Unable to start a transaction in the given
time"`, and a multi-query transaction outright expiring mid-flight). See that method's doc
comment for the specifics. Don't lower these back to Prisma's defaults without re-testing against
a real (non-localhost) database first.

## `prisma migrate dev` refuses to run non-interactively when it warns about a new constraint

Seen live adding `ContainmentRequest.approvalId`'s `@unique` constraint: any schema change
Prisma considers risky (a new unique constraint that could fail against existing duplicate data,
for example) makes `migrate dev` print a warning and wait for interactive confirmation — even
with `--create-only`, and even in an environment with no duplicate data left to violate it. In a
non-interactive shell this fails outright: `"Prisma Migrate has detected that the environment is
non-interactive, which is not supported."` There's no flag to force it through. The workaround:
hand-write the migration directory and SQL yourself, following the same
`<UTC-timestamp>_<name>/migration.sql` layout and Prisma's own constraint-naming convention
(`<table>_<column>_key` for a single-column unique) as `prisma migrate dev` would have generated,
then apply it with `prisma migrate deploy` — which applies pending migrations without prompting.
Always resolve whatever made Prisma warn (e.g. delete/fix duplicate rows) *before* applying a
hand-written unique constraint, the same as you would before letting `migrate dev` do it for you.

## Verifying RLS actually works (not just that the app "seems to" respect tenants)

The whole point of RLS is that it holds even when application code has a bug. To actually
prove that, don't just test through the API — connect as `efims_app` directly and confirm a
session with no tenant context set sees zero rows, not all rows:

```sql
-- as efims_app, with no app.current_tenant set yet:
SELECT count(*) FROM users;  -- must be 0, even though seed data exists

SELECT set_config('app.current_tenant', '<a real tenant id>', false);
SELECT count(*) FROM users;  -- now shows that tenant's users only
```

If the first query returns anything other than `0`, RLS is not actually enforcing — check that
you're connected as `efims_app` (not the table owner/a superuser) and that
`ALTER TABLE ... FORCE ROW LEVEL SECURITY` ran (it's in `rls-policies.sql`; superusers bypass
RLS even with FORCE, by design — that's a Postgres-level exception, not a bug in this setup).

## Audit flow this module implements

architecture.md: "append-only ledger, write-only API." Every other module in this codebase only
ever gets the write half — `AuditService.record()`, called from inside their own services, never
from outside this codebase's controllers. The read half (`AuditController`) is this module's own
addition, gated to oversight roles, not exposed to "everything else" the way `record()` is.

- **Hash chain**: every `AuditEvent` carries `hash` and `previousHash`, one chain per tenant
  (never a single chain across tenants — that would leak cross-tenant event volume/ordering
  through an otherwise RLS-isolated table). `AuditService.record` computes each new hash from the
  row's own fields plus the previous event's hash, under a `pg_advisory_xact_lock(hashtext(
  tenantId))` so two concurrent writes for the same tenant can't both read the same "latest" hash
  and fork the chain (different tenants never contend with each other). Tampering via any path
  that bypasses the app — the one thing this table's own RLS/grants can't stop a true database
  superuser from doing directly — is at least detectable afterward, even though it can't be
  prevented at the database level for that one role. Live-proven, not just declared: `efims_app`
  itself has no UPDATE grant on `audit_events` at all (confirmed via `rls-policies.sql`'s
  `REVOKE`); a deliberate direct `UPDATE` via the privileged migration-owning connection (the one
  role that *can* bypass RLS/grants) was caught immediately by `GET /audit-events/verify`,
  correctly naming the exact tampered row.
- `GET /audit-events` — filtered, paginated read (`entityType`, `entityId`, `actorUserId`,
  `action`, `outcome`, `from`/`to`, `limit`/`offset`) of the caller's own tenant's ledger. Gated
  to `TEAM_LEAD`/`FRAUD_RISK_MANAGER`/`COMPLIANCE_MLRO`/`LEGAL_COUNSEL`/`EXECUTIVE`/`ADMIN`. Every
  call is itself audited (`audit.query`) — access to the audit log is the sensitive event, same
  reasoning as `WhistleblowerVaultService`.
- `GET /audit-events/verify` — walks the caller's tenant's entire chain and recomputes every
  hash; `{ intact, eventsChecked, brokenAtEventId? }`. O(n) in ledger size — acceptable at MVP
  volumes; a checkpointed/incremental verify for large ledgers is future work, not built ahead of
  need. Also self-audits (`audit.verify_chain`, outcome `FAILURE` if the chain is broken).
- **A real bug found and fixed live, during this module's own verification**: the hash-canon-
  icalization function walked `Object.keys()` on `metadata` directly, which for an object with
  `undefined`-valued keys (exactly what `AuditService.query`'s own metadata — an
  `AuditEventQuery` full of optional, often-unset filter fields — produces) hashed a *different*
  key set than what Postgres JSONB actually persists (JSON serialization silently drops
  `undefined`-valued object keys on the way in, the same as `JSON.stringify` does). The very
  first live call to `query()` broke chain verification for events that were never tampered with
  at all — a false positive from an algorithm bug, not evidence of an intrusion. Fixed by making
  `canonicalize()` mirror `JSON.stringify`'s own `undefined` semantics exactly (object keys
  omitted, array elements become `null`), then re-verified live that the exact call pattern that
  broke it no longer does.
- **Staged migration**: `AuditEvent.tenantId` was tightened from optional to required (every
  real call site always provided one — see `AuditService`'s doc comment on why a pre-tenant-
  resolution login failure is deliberately not written here at all) and `hash` was introduced as
  nullable, backfilled for the 74 live rows that predated this feature via a one-time script
  (since deleted — its job was done, and it can't type-check against the now-required column
  anyway), then tightened to required in a follow-up migration. When the canonicalization bug
  above was found and fixed, a second one-time script recomputed every event's hash under the
  corrected algorithm (also since deleted) — legitimate because the underlying event *data* was
  never touched, only a buggy hash-computation tool was fixed; recomputing a hash for an
  unchanged fact under a corrected algorithm is not the same thing as falsifying history.

## Cross-cutting infrastructure

Not a build-order module — added across every module above in one pass, live-verified together.
`src/infrastructure/` holds the pieces with no single feature-module home (`health`, `realtime`);
everything else lives in `main.ts`/`app.module.ts` or inline in the modules it touches.

- **Rate limiting** (`@nestjs/throttler`) — global guard, in-memory store (`THROTTLE_TTL_MS`/
  `THROTTLE_LIMIT` in `.env`, default 100 req/60s), applied to every request including
  unauthenticated ones (protecting `/auth/login` from brute force matters as much as protecting
  an authenticated route). `/health*` is exempted (`@SkipThrottle()`) — a load balancer polling
  it every few seconds should never get throttled into reporting a false unhealthy instance.
  Live-verified: 105 rapid requests against `/auth/login` returned `429` starting at request 101.
- **Caching** (`@nestjs/cache-manager`, in-memory) — deliberately not Redis; see "What's
  deliberately not here yet" below. Wired into `ConfigurationService.getCurrent` (5s TTL,
  invalidated explicitly on `createDraft`/`ratify`, not just left to expire) — the read-heaviest,
  rarest-to-change data in the codebase. Nothing access-control-critical is cached (compartment
  grants, team membership, case/incident visibility checks all still hit the database on every
  call) — a stale cache on an authorization decision is a real risk this codebase avoids
  deliberately, not an oversight. Live-verified: ratifying a new CD-07 version was immediately
  visible on the very next `GET`, not stale for the TTL window.
- **Security headers & CORS** (`helmet`, `main.ts`) — CSP/HSTS/X-Frame-Options on every response;
  CORS is a real allow-list (`CORS_ORIGINS` in `.env`), not wide open. Live-verified: an
  unlisted `Origin` gets no `Access-Control-Allow-Origin` header back, the configured one does.
- **Health checks** (`@nestjs/terminus`, `GET /health` / `GET /health/ready`) — unauthenticated
  (`@Public()`) and unthrottled, matching what a load balancer / uptime monitor actually needs:
  liveness (process is answering, no DB call) vs. readiness (database is actually reachable).
- **Pagination** — `limit`/`offset` (shared `PaginationQueryDto`, capped at 100/page, default 20)
  on `GET /incidents`, `GET /signals`, `GET /cases` (`audit-events`/`notifications` already had
  their own before this pass). `incidents`/`cases` paginate *after* their compartment/access
  filter, not via SQL `LIMIT`/`OFFSET` directly — see the doc comment on `IncidentsService.list`
  for why a DB-level page would return fewer than `limit` visible rows once that filter runs.
- **Real-time** (`src/infrastructure/realtime/`, Socket.IO at `/realtime`) — JWT-authenticated at
  handshake (same secret/payload as every REST endpoint), tenant- and user-scoped rooms. Feature
  modules never touch `RealtimeGateway`/`socket.io` directly — they inject `RealtimeService`
  (`emitToTenant`/`emitToUser`), the one seam that would need to change if the transport ever did.
  Live-verified with two real websocket clients: a requester and an authorized decider, both
  receiving their respective push (`approval.requested`, `approval.decided`) with no poll or
  reload — see `test/manual/realtime-notifications.manual.js`.
- **Event bus** (`@nestjs/event-emitter`, wildcard-enabled) — `src/common/events/domain-events.ts`
  is the shared contract every emitter (`workflow`'s `ApprovalService`/`SlaClockService`,
  `cases`' `CasesService`) and listener (`notifications`) depend on, so neither side imports the
  other's service. This is what let `notifications` be wired in *last*, after everything it
  reacts to, without changing any of those modules' public APIs.
- **Indexing pass**: `TeamMembership`/`CaseUserFlag` both had a compound unique constraint that
  only covers queries filtering on its *first* column — `TeamsService.getUserTeamIds`/
  `CasesService.getFlaggedCaseIds` filter by `userId` alone, on every case-list/case-access
  check in the codebase, with no covering index until this pass added one to each.

## Auth flow this module implements

- `POST /auth/login` — `{ tenantSlug, email, password }` → `{ accessToken, refreshToken, user }`.
  Tenant comes from the request body (there's no session/subdomain yet to infer it from), which
  is why this is the one place in the identity module that queries Postgres outside
  `PrismaService.withTenant`/`forCurrentTenant` — see the comment on `AuthService.login`.
- `POST /auth/refresh` — `{ refreshToken }` → new `{ accessToken, refreshToken }`. Rotates the
  refresh token on every use and detects reuse of an already-rotated-out token as a possible
  theft signal (revokes all of that user's other refresh tokens when it happens).
- `POST /auth/logout` — `{ refreshToken }` → revokes that one refresh token.
- `GET /users/me` — current user's profile (requires a valid access token).
- `POST /users` — admin-only (`Role.ADMIN`), creates a user in the *caller's own tenant* — there
  is no way to pass a different tenant id into this endpoint.

Access tokens are short-lived signed JWTs (`JWT_ACCESS_SECRET`, default 15m) carrying
`{ sub, tenantId, email, role, clearanceLevel }`. Refresh tokens are JWTs too
(`JWT_REFRESH_SECRET`, default 7d) but only to carry routing info (which tenant/row to check) —
the actual revocation state lives in the `refresh_tokens` table, checked by hash on every
refresh. Losing `JWT_REFRESH_SECRET` doesn't matter for revocation; losing the database access
does.

## Configuration flow this module implements

CD-01 through CD-08 (`docs/configuration-decisions.md`) as versioned, per-tenant config —
every write is a new version, nothing is ever mutated after creation, and only one version per
key is ever "ratified" (current/active) at a time:

- `GET /configuration` — the current value of every CD key for the caller's tenant (any
  authenticated user).
- `GET /configuration/:key` — current value + full version history for one key. `:key` is one
  of the `CdKey` enum values, e.g. `CD_02_SEVERITY_THRESHOLDS`.
- `POST /configuration/:key` — admin/executive-only, creates a new DRAFT version. `{ value,
  notes? }`; `value`'s shape is validated per-key (see
  `src/modules/configuration/types/cd-value.validators.ts`) against the interfaces in
  `cd-value.types.ts`, which mirror `docs/configuration-decisions.md` section by section.
- `POST /configuration/:key/:version/ratify` — admin/executive-only, marks a DRAFT as RATIFIED
  (supersedes whatever was previously ratified for that key) with an optional `effectiveDate`
  (defaults to now).

"Current" resolution (`ConfigurationService.getCurrent`): the latest RATIFIED version whose
`effectiveDate` has passed, falling back to the latest DRAFT if nothing's been ratified yet —
per CLAUDE.md non-negotiable #9, every CD value is a working default until its named owner
signs off, and the system has to run on *something* in the meantime.

Mutation routes are gated to `Role.ADMIN`/`Role.EXECUTIVE` as a placeholder for the actual
per-CD owner named in the doc (Fraud Risk, Risk/Executive, Operations, Governance, Legal/
Records, Sponsor, Technology, Model Governance) — none of which map 1:1 onto the `Role` enum
identity owns. Deliberately not solved here; see the comment on `ConfigurationController`.

## Incidents flow this module implements

`Signal → Incident`, kept as two distinct tables per CLAUDE.md non-negotiable #1 — a Signal is
an unvalidated report from any source; an Incident only exists once a human reviewer validates
one. There is no way to create an Incident except by validating a Signal (no `POST /incidents`
route exists at all — see the doc comment on `IncidentsService.createFromSignal`).

- `POST /signals` — any authenticated user files a signal: `{ source, summary, externalRef?,
  payload? }`, plus `isAnonymous`/`reporterName`/`reporterContact` when `source` is
  `WHISTLEBLOWER`. A whistleblower signal atomically creates a
  `WhistleblowerIdentityVaultEntry` row in the *same* transaction as the Signal — see the doc
  comment on `WhistleblowerVaultService`.
- `GET /signals`, `GET /signals/:id` — list/read (optionally filtered by `?status=`).
- `POST /signals/:id/validate` — triage-role-only (`INVESTIGATOR`/`TEAM_LEAD`/
  `FRAUD_RISK_MANAGER`/`ADMIN`). Either `{ category, type, title, description, subtype?,
  compartment?, occurredAt? }` to create a new Incident, or `{ linkToIncidentId }` to attach this
  signal as corroboration of an existing one (the dedupe decision is a human call, not an
  algorithm — CD-08 scopes automated duplicate-detection to a later AI phase). A
  `WHISTLEBLOWER`-sourced signal is always forced into the `WHISTLEBLOWING` compartment
  regardless of what's sent. Incident creation and the Signal's status update happen inside one
  transaction — a signal can never end up `VALIDATED` without its Incident existing, or vice
  versa.
- `POST /signals/:id/reject` — triage-role-only, `{ reason }`.
- `GET /incidents`, `GET /incidents/:id` — every read is filtered by compartment: an Incident
  whose `compartment` isn't `STANDARD` is only visible to actors holding that compartment grant
  (`UserCompartmentGrant`, read cross-module via `UsersService.getGrantedCompartments` — see the
  module-boundary comment there). A single-resource denial is audited (`DENIED`); list scoping is
  silent filtering, not an audited denial, matching how identity's own grants behave.
- `POST /incidents/:id/relate`, `POST /incidents/:id/merge` — link two incidents as related, or
  mark one as a duplicate of another (`MERGED` status + `mergedIntoIncidentId`). Both require the
  actor to be able to see both incidents.
- `GET /incidents/:signalId/whistleblower-identity` — the reporter identity behind a
  whistleblower-sourced signal. Gated to `COMPLIANCE_MLRO`/`LEGAL_COUNSEL`/`ADMIN` only (not the
  investigator working the resulting incident day to day) — see `WhistleblowerVaultService`.
  Every access is audited, not just denials, since access itself to this vault is the sensitive
  event, matching a real whistleblower-protection program's own logging obligations.

An Incident's `category`/`type` are validated against the tenant's *current* CD-01 taxonomy
(`ConfigurationService.getCurrent`) at creation time — never a hardcoded list, since taxonomy is
versioned per-tenant config, not code.

## Triage flow this module implements

architecture.md's "severity engine, routing, escalation" — every route is nested under the
incident it assesses (`/incidents/:incidentId/triage...`), and every `TriageAssessment` is a new
row, never mutated (same append-only posture as `ConfigurationEntry`'s version history): the
*current* triage state of an incident is just its latest assessment, not a separate synced field.

- `POST /incidents/:incidentId/triage` — the first assessment: `{ severity, slaCalendarName,
  assignedTeamId?, rationale }`. `severity` is one of the fixed `SeverityTier` enum values
  (`S1`-`S4` — CD-02's tier *names* are fixed by design, unlike CD-01's freeform categories).
  `slaCalendarName` is validated against the tenant's *current* CD-03 configuration, the same
  pattern `IncidentsService` uses for CD-01. `assignedTeamId`, if given, must be a real `Team`
  (validated cross-module via `TeamsService.assertExists`). Triage-role-only, same set as
  `SignalsController`'s validate/reject. Also moves the incident `OPEN` → `UNDER_REVIEW` — see
  the doc comment on `IncidentsService.markUnderReview` for why that's the *only* status
  transition this module (or `triage`) is allowed to trigger, not a general state machine (that's
  `workflow`'s future job). 400s if the incident already has an assessment — use `escalate`.
- `POST /incidents/:incidentId/triage/escalate` — revises a prior assessment; same body shape.
  Despite the name, severity can move in either direction (a correction is exactly as valid an
  event as an escalation — see the doc comment on `TriageAssessment` in `schema.prisma`). 400s if
  the incident has no prior assessment yet.
- `GET /incidents/:incidentId/triage` — the current (latest) assessment. 404 if none yet.
- `GET /incidents/:incidentId/triage/history` — every assessment for the incident, newest first,
  with `previousAssessmentId` chaining each revision back to the one it replaced.
- `GET /teams` — new in `identity` alongside this module: teams existed in the schema since the
  `identity` module shipped but had no read API at all until `triage` needed one to make
  `assignedTeamId` usable through the API. Any authenticated user; a team has no sensitive fields.

Every read route (`GET .../triage`, `GET .../triage/history`) delegates to
`IncidentsService.getById` first — compartment visibility is enforced there, not duplicated here.

## Cases flow this module implements

The module CLAUDE.md non-negotiable #6 and architecture.md §4.3 are actually about — the full
7-condition case-access rule (tenant, role, team, subject, conflict, clearance, compartment) is
enforced for real here, not just referenced. Two of the 7 are enforced elsewhere on purpose: tenant
match is RLS (a case fetched under the wrong tenant context simply doesn't come back); per-action
role permission is `@Roles()` at the controller, the same pattern every other module here uses.

- `POST /cases` — case-role-only (`INVESTIGATOR`/`TEAM_LEAD`/`FRAUD_RISK_MANAGER`/`ADMIN`):
  `{ title, description, sensitivityLevel, compartment?, assignedTeamId?, incidentIds? }`.
  `sensitivityLevel` (1-4, same scale as `User.clearanceLevel`) is always required — never
  auto-derived from a linked incident's CD-02 severity, a deliberately different axis (see the
  doc comment on `Case.sensitivityLevel` in `schema.prisma`). Each `incidentId` must already be
  visible to the caller and in a linkable status; linking sets `Incident.status` to
  `LINKED_TO_CASE` (the value that's existed as a placeholder since the `incidents` module
  shipped) via `IncidentsService.linkToCase`, the cross-module write pattern already established
  by `markUnderReview`.
- `GET /cases` — every case in the tenant, filtered down to what the caller can actually access.
  Batches the compartment-grant, team-membership, and subject/conflict-flag lookups into one
  query each rather than per case (an N+1 pattern this project's own live-verification pass
  already proved costly against a real database — see the 2026-09-21 CHANGELOG entries).
- `GET /cases/:id` — the single-record path of the same check, with a denial reason (not exposed
  to the caller, only to the audit log) recorded on every `DENIED` outcome: `not_on_assigned_team`,
  `user_is_subject`, `user_has_conflict`, `insufficient_clearance`, or `compartment_not_authorized`.
- `POST /cases/:id/status` — `{ status, reason? }`. Writes a `CaseStatusHistory` row on every
  transition; 400s on a no-op transition to the same status. Not a workflow engine — no validity
  matrix beyond that, no approval gate (`workflow`'s future job).
- `POST /cases/:id/team` — reassigns `assignedTeamId` (validated via `TeamsService.assertExists`).
- `POST /cases/:id/incidents` — links an additional incident to an existing case.
- `POST /cases/:id/flags`, `DELETE /cases/:id/flags/:flagId` — declare or clear a `SUBJECT`
  (under investigation on this case) or `CONFLICT` (declared conflict of interest) flag on a
  user. Narrower role gate than the rest of this module
  (`TEAM_LEAD`/`FRAUD_RISK_MANAGER`/`COMPLIANCE_MLRO`/`LEGAL_COUNSEL`/`ADMIN`) — declaring someone
  a subject or conflict is more consequential than routine case administration. Deletable (unlike
  `TriageAssessment`'s pure append-only history) — a conflict can be resolved, a subject cleared.
- `POST /teams/:id/members` — new in `identity` alongside this module: needed so the team-match
  condition could be exercised through the API at all. Admin-only, matching
  `UsersController.createUser`'s own reasoning. Deliberately minimal — no remove-member endpoint,
  no team creation via API yet.

**"Elevated role" bypass for the team-match condition** (architecture.md §4.3 names the concept
but not which roles qualify — a flagged scope decision, same as `ConfigurationController`'s
CD-owner mapping caveat): `FRAUD_RISK_MANAGER`, `COMPLIANCE_MLRO`, `LEGAL_COUNSEL`, `EXECUTIVE`,
`ADMIN` bypass team-match entirely (cross-cutting oversight functions); `INVESTIGATOR`,
`TEAM_LEAD`, `CASE_OWNER` need actual `TeamMembership` on the case's assigned team.

## Workflow flow this module implements

architecture.md's "state machine, SLA clocks, approvals" — two genuinely separate mechanisms
sharing one module: SLA tracking (anchored to Incident, since severity/calendar already live on
`TriageAssessment`) and a generic approval mechanism implementing CD-04's matrix (anchored to
Case, since that's what the matrix's 4 actions are about). The module boundary here matters more
than most: `WorkflowModule` does NOT import `CasesModule` — every approval route lives on
`CasesController`'s side instead (see below), specifically so `cases` can depend on `workflow`
(for the closure-approval gate) without a circular module dependency. See the doc comment on
`ApprovalService` for the full reasoning.

**SLA clocks** (`src/modules/workflow/sla-clock.*`, nested under
`/incidents/:incidentId/sla-clock`):
- `POST .../sla-clock` — `{ targetDeadline }`. Requires the incident to already have a current
  `TriageAssessment` (its `slaCalendarName` is copied onto the clock); 400s if the incident
  already has a running/paused clock. `targetDeadline` is deliberately caller-supplied, not
  computed from severity — CD-02's `containmentUrgency` is prose ("Immediate, 24x7"), not a
  number anywhere in `configuration-decisions.md`, and inventing one would be exactly the kind of
  thing this codebase has consistently avoided (see CD-02's `financialLossThresholdNgn` staying
  `null` for the same reason).
- `GET .../sla-clock` — the current clock plus two computed fields not stored in the DB:
  `isBreached` and `remainingMs`.
- `POST .../sla-clock/:clockId/pause` — `{ reason }`, narrower role gate than start/stop
  (`TEAM_LEAD`/`FRAUD_RISK_MANAGER`/`COMPLIANCE_MLRO`/`ADMIN`) — CD-03: "Any SLA pause requires a
  logged reason and approval." The reason is `dto.reason`; the approval is the role gate itself
  plus the resulting audit event.
- `POST .../sla-clock/:clockId/resume` — accumulates the just-ended pause window into
  `totalPausedMinutes` (not milliseconds — see the field's own doc comment in schema.prisma for
  why: Prisma maps Postgres `bigint` to JS `BigInt`, which breaks `JSON.stringify` by default).
- `POST .../sla-clock/:clockId/stop`.

**Approvals** (`src/modules/workflow/approval.service.ts`, routes on `CasesController`):
- `POST /cases/:id/approvals` — `{ action, severityBand, requestNotes }`. `severityBand`
  (CD-04's "S1/S2" vs "S3/S4" rows) is caller-supplied, not derived from a linked incident's
  severity — a Case can aggregate multiple incidents of different severities, so which band
  applies is a human judgment call, not something this module infers.
- `GET /cases/:id/approvals` — every approval request for the case.
- `POST /cases/:id/approvals/:approvalId/decide` — `{ approved, decisionNotes? }`. No
  `@Roles()` gate: who's authorized varies per (action, severityBand) per the hardcoded
  `APPROVAL_MATRIX` in `ApprovalService` (CD-04's matrix, with its free-text approver names
  mapped onto actual `Role` values — see that constant's own doc comment for the mapping and its
  approximations, e.g. "peer review" -> `TEAM_LEAD`). Two checks enforced regardless of role:
  the request must still be `PENDING`, and the decider cannot be the original requester
  (segregation of duties) — live-verified: self-approval and wrong-role decide attempts both
  return 403 and both write a `DENIED` audit event (`self_approval_blocked` /
  `role_not_authorized`). The first live test caught these two denial paths auditing
  inconsistently (only the role check did); fixed before this entry was written, not left as a
  known gap.
- **The one concrete integration point**: `CasesService.updateStatus` requires `dto.approvalId`
  when transitioning to `CLOSED` — it must reference an `APPROVED` request with
  `action=CASE_CLOSURE` for that exact case (`ApprovalService.assertApproved`). No other case
  status transition requires approval. Live-verified end to end: request → self-approval blocked
  → wrong-role blocked → correct role (`FRAUD_RISK_MANAGER`) approves → close without a
  reference blocked (400, DTO validation) → close referencing the still-`PENDING` request blocked
  (400) → close referencing the `APPROVED` request succeeds, `closedAt` set.

## Notifications flow this module implements

architecture.md: "templates, delivery, escalation." Reacts to domain events other modules emit
(`src/common/events/domain-events.ts`) — never imports `WorkflowModule`/`CasesModule`, only
`IdentityModule` (to resolve *recipients*) and `RealtimeModule` (to push live).

- **Triggers wired up**: `approval.requested` (notifies whoever CD-04's `APPROVAL_MATRIX` says
  can decide it — resolved by `workflow` itself, not by `notifications`), `approval.decided`
  (notifies the original requester), `case.status_changed` when `toStatus=CLOSED` (notifies the
  case's team, excluding whoever closed it — every other transition is deliberately silent, too
  routine to notify on), `sla_clock.breached` (notifies every `FRAUD_RISK_MANAGER`, the broadest
  role with a standing interest — no per-incident owner exists to notify more precisely until an
  incident is linked to a case).
- **IN_APP delivery is real**: the `Notification` row's existence *is* the delivery, pushed live
  via `RealtimeService.emitToUser` at creation time and independently queryable/mark-as-readable
  through `GET /notifications` / `POST /notifications/:id/read` — no `@Roles()` gate on either,
  since a notification only ever belongs to the requesting user (enforced by filtering/ownership
  checks inside the service, not a role).
- **EMAIL/SMS/PUSH delivery is stubbed** — every `NotificationDelivery` resolves immediately as
  SENT, logged instead of calling a real provider, exactly the "build the seam now, wire in the
  real thing later" pattern `ml-gateway` already uses for Groq. Swapping in a real provider later
  changes `NotificationsService.deliverExternal`'s body, not this module's schema or public shape.
- **Escalation**: any `HIGH`-priority notification still unread 15 minutes after creation gets an
  EMAIL delivery (stubbed) via a scheduled sweep (`@Cron(EVERY_5_MINUTES)`), matching
  `SlaClockService.sweepBreachedClocks`'s "no ambient tenant context in a scheduled job" pattern —
  lists tenants directly, uses `withTenant` explicitly per tenant.
- **"Templates" are hardcoded** inline title/body construction per event handler, not a database
  table — same reasoning as `workflow`'s `APPROVAL_MATRIX`: nothing reads or writes a template
  through an API yet.
- Live-verified with two real users and two real websocket connections — see the Real-time
  bullet under "Cross-cutting infrastructure" above for the full flow, and
  `test/manual/realtime-notifications.manual.js` to re-run it.

## Investigations flow this module implements

architecture.md's "plans, issues, interviews, findings" — every route is nested under the case
it investigates (`/cases/:caseId/investigation-plans`, `.../issues`, `.../interviews`,
`.../findings`), and every method calls `CasesService.getById(actor, caseId)` first: the full
7-condition access rule is enforced there, not duplicated here — this module owns none of that
logic, matching how `triage` defers to `IncidentsService.getById`.

- `POST /cases/:caseId/investigation-plans` — `{ objectives, scope, status? }`. `InvestigationPlan`
  is versioned/append-only, same posture as `ConfigurationEntry`/`TriageAssessment`: a revision is
  a new row (`version` auto-incremented per case), never a mutation of the previous one. Case-role
  gated (`INVESTIGATOR`/`TEAM_LEAD`/`FRAUD_RISK_MANAGER`/`ADMIN`, the same set `cases` itself uses
  for routine administration).
- `GET /cases/:caseId/investigation-plans` — every version, newest first.
- `GET /cases/:caseId/investigation-plans/current` — the latest version only. 404 if none exists
  yet (no plan is auto-created alongside a case).
- `POST /cases/:caseId/issues` — `{ title, description }`. Raises an `InvestigationIssue` in
  `OPEN` status.
- `GET /cases/:caseId/issues` — optionally filtered by `?status=`.
- `POST /cases/:caseId/issues/:issueId/resolve` — `{ resolution }`. 400s if the issue doesn't
  belong to this case, or is already resolved (unlike `InvestigationPlan`, an issue mutates in
  place — `status`/`resolution`/`resolvedBy`/`resolvedAt` on the same row — since there's exactly
  one lifecycle transition to record, not a revision history).
- `POST /cases/:caseId/interviews` — `{ intervieweeName, intervieweeRole, intervieweeUserId?,
  conductedAt, summary, notes? }`. Pure append-only record, no update/resolve path — an interview
  that happened is a historical fact, not a thing with a status. `intervieweeUserId` is optional
  and unvalidated against `identity` on purpose: an interviewee is very often not an EFIMS user at
  all (a customer, an external witness), so this is a free-text/optional-linkage field, not a
  foreign-key-enforced one.
- `GET /cases/:caseId/interviews` — newest first.
- `POST /cases/:caseId/findings` — `{ title, description, supportingEvidence?, resolvesIssueId? }`.
  `resolvesIssueId`, if given, must reference an existing issue on the *same* case (400 otherwise)
  — this is the one cross-entity link in the module: a finding can close the loop on an issue it
  answers, but doesn't have to (many findings are freestanding). Recording a finding does NOT
  itself resolve the issue — `resolvesIssueId` is a reference/annotation, not a side effect; the
  issue still needs its own explicit `.../resolve` call if it should actually close.
- `GET /cases/:caseId/findings` — newest first.

Every write action is audited (`investigations.plan.create`, `investigations.issue.raise`,
`investigations.issue.resolve`, `investigations.interview.record`,
`investigations.finding.record`) with `caseId` in the metadata, matching every other module's
audit posture — reads are not separately audited here (unlike the whistleblower vault or the
audit log itself, nothing in this module is sensitive enough on its own to warrant that; the
case-level access check it delegates to already audits its own denials).

Live-verified end to end: plan v1 created → v2 created (version auto-incremented, `current`
correctly returns v2 while `listPlans` still shows both) → issue raised → interview recorded →
finding recorded referencing the issue via `resolvesIssueId` → issue explicitly resolved →
access denied (403) for a user failing the case's 7-condition check, confirmed as an audited
`DENIED` case-access event, not a silent 404 → RLS isolation reconfirmed (a second tenant's
`efims_app` session sees zero rows across all four tables) → edge cases: resolving an
already-resolved issue (400), a `resolvesIssueId` pointing at an issue on a *different* case
(400), a plan/issue/interview/finding request against a case the actor can't access (403, same
path as every other case-scoped read/write in this codebase).

## Evidence flow this module implements

architecture.md's "vault, hashing, custody, legal hold" and §7's security note: "hash on ingest
+ custody log, so tampering is detectable." Every route is nested under the case it belongs to
(`/cases/:caseId/evidence`), and every method calls `CasesService.getById(actor, caseId)` first,
same discipline as `investigations`. **This module is not a file/object store** — there is no
`infrastructure/storage` integration in this codebase yet (architecture.md's own module map lists
it as aspirational). `EvidenceItem` stores a SHA-256 hash of whatever content is supplied at
ingest, plus an `externalRef` pointer to wherever that content actually lives (a DMS, an S3
bucket, a shared drive) — never the content itself.

- `POST /cases/:caseId/evidence` — `{ category, title, description?, externalRef?,
  sourceSystem?, content }`. `content` is hashed server-side (SHA-256) and discarded — only the
  hash is persisted. Auto-logs a `COLLECTED` custody event in the same transaction. Case-role
  gated, same set as `investigations`.
- `GET /cases/:caseId/evidence` — every item on the case, newest-collected first. Never returns
  content (there is none stored to return).
- `GET /cases/:caseId/evidence/:evidenceId` — one item plus its full custody history, oldest
  first (a chronological chain, not newest-first like the list views).
- `POST /cases/:caseId/evidence/:evidenceId/custody` — `{ action, relatedUserId?, notes? }`,
  `action` one of `COLLECTED`/`VIEWED`/`EXPORTED`/`TRANSFERRED`/`HASH_VERIFIED`. `relatedUserId`
  is who an item was transferred *to* on a `TRANSFERRED` event, unused otherwise. Custody events
  are explicit application calls, not automatic (e.g. a `GET` doesn't itself log a `VIEWED`
  event) — same "explicit logging, not middleware-inferred" posture the whistleblower vault's
  audit access-logging already uses.
- `POST /cases/:caseId/evidence/:evidenceId/verify` — `{ content }`, the same content originally
  supplied at ingest, re-hashed and compared to the stored hash. Always logs a `HASH_VERIFIED`
  custody event and an `evidence.hash.verify` audit event regardless of outcome — a verification
  *attempt* is itself part of the chain of custody, not just its result; outcome is `FAILURE` in
  the audit log when the hash doesn't match, mirroring how `audit.verify_chain` self-audits a
  broken chain. This can only detect tampering on the content as re-supplied to this API — it
  cannot inspect or protect whatever copy actually lives at `externalRef`.
- `POST /cases/:caseId/evidence/:evidenceId/legal-hold` — `{ hold, reason? }`. Narrower role gate
  (`LEGAL_COUNSEL`/`COMPLIANCE_MLRO`/`ADMIN`) than routine evidence handling — no CD-04 entry
  names who approves a legal hold, so this mirrors CD-05's own ownership table (Legal/Records)
  plus the compliance function most likely to need one. 400s if the item is already in the
  requested hold state (no-op transitions rejected, same pattern `CasesService.updateStatus`
  uses). CD-05: evidence retention "matches the linked case's retention class, with legal-hold
  override that suspends any disposal job... never auto-deleted under active hold" — no disposal
  job exists yet (see below), so this flag is currently the seam a future retention sweep would
  have to check, not an active enforcement mechanism.

Every write is audited (`evidence.item.ingest`, `evidence.custody.record`,
`evidence.hash.verify`, `evidence.legal_hold.set`/`evidence.legal_hold.release`) with `caseId` in
the metadata.

Live-verified end to end: item ingested (hash computed and confirmed correct via independent
recomputation), full custody history returned oldest-first, a `TRANSFERRED` custody event
recorded, hash verification with matching content (`intact: true`) and with deliberately altered
content (`intact: false`, both outcomes logged as custody events and audit events with the
correct `SUCCESS`/`FAILURE` outcome), legal hold set → duplicate-set correctly rejected (400) →
released, a user with no case access denied (403, confirming delegation to `CasesService`) →
same user granted case access via team membership → correctly allowed to read/write routine
evidence actions but still denied (403) the narrower-gated legal-hold action by role, a
wrong-case/evidence-id combination correctly 404s rather than leaking existence across cases, and
RLS tenant isolation reconfirmed directly against the database (an `efims_app` session with no
tenant context set sees zero rows on both `evidence_items` and `custody_events`, despite real
rows existing).

## Containment flow this module implements

architecture.md's "action requests, confirmations", built directly around CLAUDE.md
non-negotiable #8: **EFIMS never freezes an account or blocks a card itself — it only requests
and waits.** There is deliberately no boolean "contained" field anywhere (not on `Case`, not
computed) — a case's containment posture is always the actual list of `ContainmentRequest` rows
and each one's own `status`, never a single derived flag that could drift from what actually
happened. Status starts at `REQUESTED`, never anything implying EFIMS itself acted, and only
becomes `CONFIRMED` on a positive callback — no other status implies the action took effect.

- `POST /cases/:caseId/containment-requests` — `{ approvalId, actionType, targetDescription,
  rationale }`. `approvalId` must reference an `APPROVED` `ApprovalRequest` with
  `action = CONTAINMENT` for this exact case — enforced by `ApprovalService.assertApproved`, the
  same reusable gate `CasesService.updateStatus` already uses for case closure. A containment
  request can never be created without CD-04's approval matrix having already authorized it.
  **One approval authorizes exactly one containment action** — `approvalId` is unique at the
  database level (`@unique` in schema.prisma), not just checked in application code; a real bug
  found live during this module's own verification (see below).
- `GET /cases/:caseId/containment-requests` — every request on the case, newest first.
- `GET /cases/:caseId/containment-requests/:requestId` — one request.
- `POST /cases/:caseId/containment-requests/:requestId/confirm` — `{ confirmationRef? }`. Records
  a positive `ActionConfirmed` from the source system. No real source-system integration exists —
  this is the seam a real webhook/callback would call, exercised manually for now, same
  "build the seam now" pattern `notifications`' stubbed external channels and `evidence`'s
  `externalRef` already use. 400s if the request isn't currently `REQUESTED`.
- `POST /cases/:caseId/containment-requests/:requestId/reject` — `{ reason }`. The source system
  declined (e.g. account already closed, insufficient information). 400s if not `REQUESTED`.
- `POST /cases/:caseId/containment-requests/:requestId/cancel` — `{ reason }`. The case team
  withdraws the request before any response comes back. 400s if not `REQUESTED`.

No narrower role gate on confirm/reject/cancel beyond the same case-role set used for routine
case administration — the consequential gate is the CD-04 `CONTAINMENT` approval already required
to create the request in the first place, not who happens to record what the source system said
afterward. Every write is audited (`containment.request.create`/`confirm`/`reject`/`cancel`) with
`caseId` in the metadata.

**A real bug found and fixed live, during this module's own verification**: nothing originally
stopped the same approved `approvalId` from being reused to create a second, unrelated
`ContainmentRequest` — e.g. an approval to "suspend online access" could have been reused to also
authorize "block the card," an action it was never actually asked to approve. Caught by
deliberately testing reuse, not by inspection. Fixed by adding `@unique` to
`ContainmentRequest.approvalId` in the schema (the actual backstop against a race between two
concurrent creates) plus an application-level check in `ContainmentService.create` for a clean
400 instead of a raw Prisma constraint violation. Required a manually-authored migration
(`prisma migrate dev` refuses to run non-interactively once it detects a new-unique-constraint
risk warning, even with `--create-only`) — the migration directory and SQL were hand-written to
match Prisma's own naming convention, then applied with `prisma migrate deploy`, which doesn't
prompt.

Live-verified end to end: a bogus `approvalId` correctly rejected (400), an `approvalId`
referencing an approval for a *different* action (`CASE_CLOSURE`) correctly rejected (400) by the
same `assertApproved` check `cases` already relies on, a fresh `CONTAINMENT` approval requested
and decided by an authorized `FRAUD_RISK_MANAGER`, a containment request created against it and
confirmed, re-confirming an already-`CONFIRMED` request correctly rejected (400), reuse of the
same `approvalId` for a second request correctly rejected (400, the fix above), a second
`REQUESTED` request rejected (`REJECTED`) and a third cancelled (`CANCELLED`), a
wrong-case/request-id combination correctly 404ing, and RLS tenant isolation reconfirmed directly
against the database (an `efims_app` session with no tenant context set sees zero rows on
`containment_requests`, despite real rows existing from this same test pass).

## Recovery flow this module implements

architecture.md's "loss/recovery ledger, reconciliation". `LossEntry`/`RecoveryEntry` are pure
append-only ledger rows — a loss or recovery determination is a fact-of-record; correcting one
means recording a new correcting entry, never mutating history. All amounts assume NGN — this
codebase's only currency precedent (CD-02's `financialLossThresholdNgn`, CD-04's
`amountBandsNgn`); mixed-currency aggregation is out of scope, not silently mishandled.

- `POST /cases/:caseId/recovery/losses` — `{ amount, category, description? }`, `category` one
  of `PRINCIPAL`/`FEES`/`INTEREST`/`OTHER`.
- `GET /cases/:caseId/recovery/losses` — every loss entry, newest first.
- `POST /cases/:caseId/recovery/recoveries` — `{ amount, method, description? }`, `method` one
  of `CUSTOMER_REFUND_REVERSAL`/`INSURANCE_CLAIM`/`CHARGEBACK`/`THIRD_PARTY_RECOVERY`/`OTHER`.
- `GET /cases/:caseId/recovery/recoveries` — every recovery entry, newest first.
- `POST /cases/:caseId/recovery/write-offs` — `{ approvalId, amount, justification }`.
  `approvalId` must reference an `APPROVED` `ApprovalRequest` with `action = LOSS_WRITE_OFF` for
  this exact case (`ApprovalService.assertApproved`, the same gate `ContainmentService.create`
  uses for `CONTAINMENT`), and is `@unique` at the database level — one approval authorizes
  exactly one write-off entry, the reuse-prevention pattern `containment`'s own module found as a
  real bug and fixed; `recovery` built it in from the start instead of discovering it live again.
  Unlike a containment action, a write-off has no external system to wait on a confirmation from
  — it's an internal accounting action, final the moment it's recorded, so there's no
  `REQUESTED`/`CONFIRMED` status machine here, just an append-only ledger row.
- `GET /cases/:caseId/recovery/write-offs` — every write-off entry, newest first.
- `GET /cases/:caseId/recovery/summary` — `{ totalLoss, totalRecovered, totalWrittenOff,
  outstanding, currency }`, all computed fresh from the ledger on every call, never stored — same
  "derive, don't store a flag that can drift" posture `containment` already established for
  whether a case is "contained." `outstanding = totalLoss - totalRecovered - totalWrittenOff`.

No narrower role gate on write-offs beyond the same case-role set used for routine case
administration — the consequential gate is the CD-04 `LOSS_WRITE_OFF` approval already required
to record one. Every write is audited (`recovery.loss.record`/`recovery.recovery.record`/
`recovery.write_off.record`) with `caseId` in the metadata.

Live-verified end to end against the real Neon database: the seeded ledger's summary matched
exactly (₦450,000 loss, ₦150,000 recovered, ₦300,000 written off, ₦0 outstanding), a new loss
entry recorded and reflected in a recomputed summary, a write-off attempt with a bogus
`approvalId` rejected (400), one referencing an approval for a *different* action (`CONTAINMENT`)
rejected (400) by the same `assertApproved` check `containment`/`cases` already rely on, reuse of
an already-used `approvalId` rejected (400) on the very first live attempt (unlike `containment`,
where this same class of bug had to be found and fixed after the fact — here it was verified
correct from the start), a fresh `LOSS_WRITE_OFF` approval requested and decided by an authorized
`FRAUD_RISK_MANAGER` and successfully recorded, the summary correctly updating to reflect it
(₦455,000 loss, ₦305,000 written off, still ₦0 outstanding), a user with no case access denied
(403), and RLS tenant isolation reconfirmed directly against the database (an `efims_app` session
with no tenant context set sees zero rows across all three new tables, despite real rows
existing from this same test pass).

## CAPA flow this module implements

architecture.md's "root cause, actions, validation". `RootCauseAnalysis` is versioned/append-only
like `InvestigationPlan` — a revised understanding of root cause is a new row, never a mutation
of the last one. `CapaAction` mutates in place like `InvestigationIssue`. **No CD-04 approval
gate is wired here on purpose** — CD-04's matrix names exactly four actions (Containment, Loss
write-off, Regulatory submission, Case closure), and CAPA isn't one of them; every other module
in this codebase that reuses `ApprovalService.assertApproved` does so because CD-04 explicitly
names that action, and this module correctly doesn't invent one CD-04 doesn't specify.

- `POST /cases/:caseId/root-causes` — `{ summary, analysisMethod? }`. New version each call,
  same pattern as `investigations`' `InvestigationPlan`.
- `GET /cases/:caseId/root-causes`, `GET /cases/:caseId/root-causes/current` — every version /
  the latest only (404 if none exists yet).
- `POST /cases/:caseId/capa-actions` — `{ rootCauseId?, type, title, description, ownerId,
  dueDate }`. `type` is `CORRECTIVE` or `PREVENTIVE`. `rootCauseId` is optional — a CAPA action
  can stand alone (e.g. a quick preventive fix) even when no formal root-cause analysis exists;
  if given, it must reference a root cause on the *same* case (400 otherwise, same
  cross-entity-validation pattern `investigations`' `Finding.resolvesIssueId` uses).
  `ownerId` is validated against `identity` via `UsersService.assertUserExists` (same pattern
  `cases`' `assignedTeamId` uses via `TeamsService.assertExists`) — unlike `investigations`'
  `Interview.intervieweeUserId`, an action owner IS always expected to be a real EFIMS user.
- `GET /cases/:caseId/capa-actions` — optionally filtered by `?status=`.
- `POST /cases/:caseId/capa-actions/:actionId/start` — `OPEN` → `IN_PROGRESS`. 400s otherwise.
- `POST /cases/:caseId/capa-actions/:actionId/complete` — `{ completionNotes? }`. `OPEN` or
  `IN_PROGRESS` → `COMPLETED`. 400s if already `COMPLETED`/`VALIDATED`/`CANCELLED`.
- `POST /cases/:caseId/capa-actions/:actionId/cancel` — `{ reason }`. 400s if already
  `VALIDATED`/`CANCELLED` (both terminal); any other status can be cancelled.
- `POST /cases/:caseId/capa-actions/:actionId/validate` — `{ outcome, notes? }`, `outcome` one of
  `EFFECTIVE`/`PARTIALLY_EFFECTIVE`/`INEFFECTIVE`. Only a `COMPLETED` action can be validated
  (400 otherwise — live-verified: attempting to validate a fresh `OPEN` action was rejected). An
  `EFFECTIVE` outcome moves the action to `VALIDATED` (terminal); anything else **reopens it to
  `IN_PROGRESS`** — rework needed — rather than leaving it stuck at `COMPLETED` with an outcome
  nobody acted on. Live-verified: `INEFFECTIVE` correctly reopened an action, it was completed
  and validated `EFFECTIVE` a second time, reaching `VALIDATED` only then.
- `GET /cases/:caseId/capa-actions/:actionId/validations` — full validation history for one
  action, newest first (every attempt, not just the latest).

Every write is audited (`capa.root_cause.create`/`capa.action.create`/`start`/`complete`/
`cancel`/`validate`) with `caseId` in the metadata.

Live-verified end to end against the real Neon database: the seeded root cause and its
already-`VALIDATED` action confirmed readable, a new action created (`rootCauseId: null`
confirming it's genuinely optional), premature validation rejected (400), start → complete →
validate `INEFFECTIVE` → action correctly reopened to `IN_PROGRESS` (confirmed via
`?status=IN_PROGRESS` filter) → completed again → validated `EFFECTIVE` → reached `VALIDATED`,
full 2-entry validation history returned in order, cancelling an already-`VALIDATED` action
rejected (400), a separate fresh action created then cancelled successfully, a `rootCauseId`
referencing a root cause on a *different* case rejected (400), a user with no case access denied
(403), and RLS tenant isolation reconfirmed directly against the database (an `efims_app` session
with no tenant context set sees zero rows across all three new tables, despite real rows existing
from this same test pass).

## Regulatory flow this module implements

architecture.md's "obligations register, submissions" — the last module in the MVP build order.
`RegulatoryObligation.deadline` is what CD-03's "statutory/regulatory deadlines are never paused
by either calendar" actually means in this schema: unlike `SlaClock`, there is no pause/resume
mechanism on this field at all — a statutory deadline simply cannot be paused because the model
gives it no way to be, not because application code happens to enforce it.

- `POST /cases/:caseId/regulatory-obligations` — `{ obligationType, description, regulatorName?,
  deadline }`. `obligationType` is `STR_SAR_FILING`/`REGULATOR_NOTIFICATION`/`OTHER`.
  `regulatorName` is free text (e.g. "NFIU", "CBN") — this codebase doesn't hardcode a fixed
  regulator list, same reasoning `EvidenceItem.sourceSystem` already uses. Starts `PENDING`.
- `GET /cases/:caseId/regulatory-obligations` — optionally filtered by `?status=`.
- `GET /cases/:caseId/regulatory-obligations/:obligationId` — one obligation plus its full
  submission history.
- `POST /cases/:caseId/regulatory-obligations/:obligationId/submit` — `{ approvalId,
  referenceNumber?, notes? }`. Only a `PENDING` obligation can be submitted (400 otherwise — no
  resubmission/correction workflow is modeled, a deliberately simple scope). `approvalId` must
  reference an `APPROVED` `ApprovalRequest` with `action = REGULATORY_SUBMISSION` for this exact
  case (`ApprovalService.assertApproved`, the same gate `ContainmentService.create`/
  `RecoveryService.recordWriteOff` use for their own CD-04 actions — non-negotiable #4: no
  autonomous regulatory submission without a human approval step), and is `@unique` at the
  database level — one approval authorizes exactly one submission, the reuse-prevention pattern
  `containment` found as a real bug and `recovery` already carried forward; `regulatory` built it
  in from the start too. Moves the obligation to `SUBMITTED`.
- `POST /cases/:caseId/regulatory-obligations/:obligationId/acknowledge` — `{ acknowledgedRef? }`.
  Records that the regulator confirmed receipt. No real regulator-facing integration exists — this
  is the seam a real filing system or inbound webhook would call, exercised manually for now, same
  "build the seam now" pattern `containment`'s confirm/reject already established. Only a
  `SUBMITTED` obligation can be acknowledged (400 otherwise). Moves it to `ACKNOWLEDGED`
  (terminal).
- `POST /cases/:caseId/regulatory-obligations/:obligationId/waive` — `{ reason }`. Only a
  `PENDING` obligation can be waived (400 otherwise) — an obligation flagged during initial
  review that further analysis determines doesn't actually apply. Moves it to `WAIVED` (terminal).

No narrower role gate on submit/acknowledge/waive beyond the same case-role set used for routine
case administration — the consequential gate is the CD-04 `REGULATORY_SUBMISSION` approval
already required to submit, same reasoning `containment`/`recovery` already use for their own
CD-04-gated actions. Every write is audited (`regulatory.obligation.create`/`submit`/
`acknowledge`/`waive`) with `caseId` in the metadata.

Live-verified end to end against the real Neon database: the seeded obligation (already
`ACKNOWLEDGED`) confirmed readable with its submission history included, a fresh obligation
created `PENDING`, a submit attempt with a bogus `approvalId` rejected (400), one referencing a
`CONTAINMENT` approval instead of `REGULATORY_SUBMISSION` rejected (400) by the same
`assertApproved` check, reuse of an already-used `approvalId` rejected (400, correct on the very
first live attempt — same as `recovery`, the bug class never reappeared), a fresh
`REGULATORY_SUBMISSION` approval requested and decided by an authorized `COMPLIANCE_MLRO`
(confirming CD-04's S1/S2 matrix — either `COMPLIANCE_MLRO` *or* `LEGAL_COUNSEL` may decide, not
both required — this codebase has no multi-signature approval concept), submitted successfully,
a second submit attempt on the now-`SUBMITTED` obligation rejected (400), acknowledged
successfully, a separate fresh obligation's premature acknowledge (while still `PENDING`)
rejected (400), that same obligation waived successfully, a submit attempt on the now-`WAIVED`
obligation rejected (400), a wrong-case/obligation-id combination correctly 404ing, a user with
no case access denied (403), and RLS tenant isolation reconfirmed directly against the database
(an `efims_app` session with no tenant context set sees zero rows across
`regulatory_obligations`/`regulatory_submissions`, despite real rows existing from this same test
pass).

## ml-gateway flow this module implements

CLAUDE.md non-negotiable #4: the only module allowed to call any external AI/ML provider. Two
providers, two different roles — see `ml-gateway.service.ts`'s own doc comment for the full
reasoning:

- **EFIMS AI Service** (`ml-service-client.ts`) — a separate Python/FastAPI application (not part
  of this repo), reached over plain HTTP at `ML_SERVICE_BASE_URL` (default
  `http://127.0.0.1:8000`), 5s timeout. The source of truth for severity prediction (primary
  engine), transaction anomaly scoring, and recovery-probability prediction. Its own
  documentation is explicit that its models are trained on synthetic data and are "not for real
  case decisions" yet (severity S1 has only 3 training examples; recovery's cross-validated
  ROC-AUC is 0.627) — carried over here verbatim, not smoothed over.
- **Groq** (`openai` SDK pointed at Groq's base URL) — kept only as (a) an automatic fallback for
  severity if the EFIMS AI Service is unreachable, and (b) the sole engine for duplicate/
  correlation detection, which the EFIMS AI Service doesn't cover at all.

Every method is read-only and advisory — returns a suggestion object, never writes anywhere,
never fires an action itself:

- `MlGatewayService.suggestSeverity` — tries the EFIMS AI Service first (requires the incident's 8
  risk-factor fields — `financialExposureNgn`/`customerImpactCount`/`ongoingThreat`/
  `insiderInvolvement`/`dataCompromise`/`regulatoryRelevance`/`channel`/`reportedByType`, captured
  via `PATCH /incidents/:id/risk-factors` — all set; otherwise skips straight to Groq rather than
  sending the model fabricated defaults), falls back to Groq only on unreachability. A 422 from
  the structured model (our own request mapping is wrong) surfaces as a 400 instead of silently
  falling back. Response carries `source: 'structured-ml' | 'groq-fallback'`. Called from
  `TriageController`'s `GET /incidents/:incidentId/severity-suggestion`.
- `MlGatewayController`'s `POST /ml-gateway/anomaly/score` — standalone, not case-scoped (nothing
  in EFIMS models a `Transaction`); gated `EXCEPT_REPORTER_ROLES`, audited as
  `entityType: 'AdHocQuery'` since there's no real entity to tie a one-off scoring request to.
- `RecoveryController`'s `POST /cases/:caseId/recovery/predict` — derives
  `gross_actual_loss_ngn`/`containment_confirmed` from real case data (never trusts a
  client-supplied value for something already known); the four fields EFIMS doesn't model
  (`severity`/`fraud_type`/`channel`/`daysToDetection`) come from the request body.
- `MlGatewayService.findSimilarIncidents` — unchanged, Groq-only (CD-08 Phase 2's original
  duplicate/correlation detection).

Verified against a throwaway local mock implementing the EFIMS AI Service's exact documented
contract (this session had only the reference document, not the ML developer's actual running
service) — every response shape, plus the documented 422/503/500 error cases, and the Groq
fallback path specifically (confirmed firing when the mock was stopped mid-test). The real service
needs no code change on this side once available, since the client is built against the
documented contract, not the mock.

## What's deliberately not here yet

- No password-reset / invite-by-email flow — `POST /users` takes a plaintext temporary password
  from the creating admin, which is a bootstrap convenience, not a pattern to keep.
- No multi-role-per-user, no fine-grained permissions — `User.role` is a single enum. CD-04's
  approval matrix and the mockups both talk about roles as functional titles, not permission
  bundles, so this was an intentional simplification, not an oversight — see the comment on the
  `Role` enum in `schema.prisma`.
- The 7-condition case-access check from `docs/architecture.md` §4.3 (tenant + role + team +
  subject/conflict + clearance + compartment) is NOT implemented in `identity` itself — those
  pieces (auth, clearance level, compartment grants) live here, but the actual 7-condition
  enforcement is `cases`' `CasesService.assertAccess`/`isAccessible` (see the Cases flow section
  above), not anything in this module.
- No per-CD-owner approval mapping (see above) — mutation is admin/executive-gated, not routed
  to the actual named owner per CD item.
- CD-02's `financialLossThresholdNgn`, CD-04's `amountBandsNgn`, and CD-06's `cutoverDate` are
  seeded as `null` on purpose — the source doc says those are not EFIMS's to invent (Board Risk
  Committee, Governance, and the project Sponsor respectively). A real draft can set them once
  those owners provide numbers; nothing here should ever synthesize a default for them.
- `incidents` still has no severity field on the `Incident` row itself — deliberate. Severity
  (CD-02) lives in `triage`'s own `TriageAssessment` table (see the Triage flow section above),
  kept off `Incident` on purpose so an incident's classification and its (revisable, historical)
  severity/routing decision stay genuinely separate concerns, not fields on the same row that
  different modules would both need write access to. `Incident.caseId` and
  `IncidentStatus.LINKED_TO_CASE`, previously placeholders, are now real — see the Cases flow
  section below.
- No automated duplicate-detection on signals — the `linkToIncidentId` merge path is entirely a
  human decision made at `POST /signals/:id/validate` time. CD-08 explicitly scopes automated
  dedupe to a later AI phase (advisory-only, per non-negotiable #4), not MVP.
- Incident-level compartment visibility filtering (`IncidentsService.isVisible`) still checks
  only `compartment ∈ granted grants`, not the full 7-condition rule — that full check now
  exists, but only for `Case` (see the Cases flow section below). Extending it down to `Incident`
  too (team/clearance/subject-conflict, not just compartment) is not done; incidents remain
  visible on compartment alone.
- `SignalsService.list`/`getById` have no compartment filtering at all (only Incident does) —
  a Signal that hasn't been validated yet doesn't carry a compartment (it's a property of the
  Incident it becomes), so there's nothing to filter on until validation. A future iteration may
  want to restrict *raw* whistleblower-sourced signal visibility even pre-validation; not done
  here.
- `triage` has no SLA clock — it records which calendar (CD-03) applies, but starting, pausing,
  or watching an actual deadline is `workflow`'s job per architecture.md's module map ("state
  machine, SLA clocks, approvals"), not built yet.
- No severity-change approval gate — CD-04's approval matrix names who signs off on containment/
  write-off/regulatory-submission actions at each severity, but a triage assessment or escalation
  itself requires no approval step here; any triage-role user can move severity in either
  direction unilaterally. That gate belongs wherever CD-04 actually gets enforced (`workflow`,
  most likely), not invented here ahead of that module.
- `TriageAssessment.assignedTeamId` only validates that the team *exists* — nothing checks the
  assessing user is actually a member of it, nor is there any notification to the team once
  assigned.
- `teams` in `identity` remains deliberately minimal — `GET /teams` and `POST /teams/:id/members`
  exist only because `triage`/`cases` needed them to be usable through the API at all. No team
  creation via API (seed-only), no remove-member endpoint, no self-service joining.
- Case CLOSURE now requires an approved `CASE_CLOSURE` request (see the Workflow flow section
  below), but no other case status transition or team reassignment does — `POST /cases/:id/team`
  and every non-`CLOSED` `POST /cases/:id/status` call still require no approval step. CD-04
  names approvers for "Containment action" and "Loss write-off" too, but neither of those actions
  has anything to attach to yet (no `containment`/`recovery` module exists), so only the one
  action this codebase can actually act on (`cases` closing itself) is wired up.
- `CasesService`'s single-record access check (`assertAccess`) and `list`'s batch check
  (`isAccessible`) are two separate implementations of the same 7-condition logic, not a shared
  helper — see the doc comment on `isAccessible` for why (batching would defeat the point if
  `list` called the one-query-per-condition single-record path once per case).
- No case search/filtering beyond `?status=` — no filtering by compartment, team, sensitivity,
  or linked incident in the list endpoint yet.
- `CaseUserFlag` has no read endpoint (`GET /cases/:id/flags`) — the add/remove endpoints exist
  (the enforcement-critical half of non-negotiable #6's subject/conflict condition), but there's
  no way to list a case's current flags through the API yet, only via direct DB access.
- `SlaClock.targetDeadline` is entirely caller-supplied — no calendar-aware math (business-hours
  vs. 24x7 skipping non-business time), no automatic breach notification, nothing watching
  clocks in the background. This module tracks and enforces a clock a human set; it doesn't run
  one on a schedule.
- CD-03's "statutory/regulatory deadlines are never paused" isn't enforced — `SlaClock` has no
  field distinguishing a statutory deadline from an ordinary one (that distinction would need a
  link to a Regulatory Obligation, which doesn't exist yet — no `regulatory` module). Any running
  clock can currently be paused regardless of what it's tracking.
- `ApprovalService.request`/`list`/`decide` have no case-access check of their own — every route
  that reaches them lives on `CasesController` and calls `casesService.getById` first. Calling
  `ApprovalService` directly from anywhere else would skip that check entirely; it is not a
  standalone-safe API by itself, by design (see its own doc comment).
- No notification when an approval is requested or decided, or when an SLA clock breaches —
  nothing in this codebase sends anything yet (`notifications` isn't built).
- `APPROVAL_MATRIX` (the CD-04 role mapping in `ApprovalService`) is hardcoded in TypeScript, not
  read from `ConfigurationEntry` — unlike CD-01/CD-03, which are genuinely tenant-configurable
  and read live via `ConfigurationService.getCurrent`, CD-04's approver *names* don't map onto
  `Role` cleanly enough to parse at runtime (see that constant's doc comment). If CD-04 is ever
  ratified with a materially different matrix, this constant needs a matching code change — it
  will not pick up a new `ConfigurationEntry` version automatically.
- `AuditController`'s query API has no single-event `GET /audit-events/:id` route — only the
  filtered list and the whole-chain verify. No CSV/export endpoint either, for handing a ledger
  extract to an external examiner.
- `verifyChain` walks the *entire* tenant chain every call, no checkpointing — fine at MVP event
  volumes, would need revisiting (verify from the last known-good point forward, not from
  scratch) if a tenant's ledger grows into the hundreds of thousands of rows.
- No alerting on a broken chain — `verifyChain` reports `intact: false` and self-audits a
  `FAILURE` outcome, but nothing pages anyone or surfaces it proactively; someone has to call the
  endpoint to find out. `AuditService.record`'s own doc comment already flags the matching gap
  for a *failed write* (currently just a log line) — both are "should escalate to a paging alert
  once the real notification path exists," not solved here.
- Chain integrity is per tenant only — there is no cross-tenant or whole-database integrity
  statement, and no external anchor (e.g. periodically publishing a chain checkpoint hash
  somewhere outside this database) protecting against a scenario where an attacker with
  superuser access rewrites a long enough suffix of the chain that every hash re-validates
  against itself. That defends against accidental/partial tampering and against `efims_app`
  itself, not against a fully compromised database with unlimited time.
- No evidence-record linkage on `Finding.supportingEvidence` — it's a free-text field, not a
  foreign key, because no `evidence` module (vault, hashing, chain of custody) exists yet. Once it
  does, this field is the obvious place a real link would attach.
- No interview scheduling, reminders, or invitee notification — `POST .../interviews` records an
  interview that already happened; there's no "schedule one for later" concept or calendar
  integration.
- No plan-approval workflow — a new `InvestigationPlan` version can be created in any status
  (including `APPROVED`) by any case-role user; nothing routes it through `workflow`'s CD-04
  approval matrix the way case closure does. CD-04 doesn't name investigation-plan approval as one
  of its four actions, so this isn't a gap against that doc, just a lighter-weight lifecycle than
  case closure gets.
- No notification on any investigations event (issue raised, interview recorded, finding logged)
  — `notifications`' wired triggers are `approval.*`/`case.status_changed`/`sla_clock.breached`
  only; nothing in `domain-events.ts` exists for this module yet, so team members don't get
  pushed when a new issue lands on a case they're on.
- `InvestigationIssue`/`Interview`/`Finding` have no `severity`/`priority` field — every issue is
  equally weighted in the list endpoint (no way to sort or filter by importance beyond `?status=`
  on issues).
- No actual object/file storage — `EvidenceItem.externalRef` is a free-text pointer to wherever
  the real content lives; this codebase never receives, stores, or serves the underlying file.
  A real upload/download flow needs `infrastructure/storage` (architecture.md's own module map
  lists it, not built) wired in before evidence content can round-trip through this API for real.
- No retention/disposal sweep — CD-05 names a retention schedule and a legal-hold override that
  "suspends any disposal job," but no scheduled job disposes of anything in this codebase yet
  (matching `SlaClockService`/`NotificationsService`'s cron pattern, just not built for evidence).
  `EvidenceItem.legalHold` is the seam such a job would have to check, not an active safeguard.
- No automatic custody logging — `VIEWED`/`EXPORTED` custody events require an explicit
  `POST .../custody` call; a plain `GET` on an item does not itself log that it was viewed. A
  stricter chain-of-custody posture (auto-logging every read) was deliberately not built — see
  the module's own README section above for the reasoning (matches the vault's own "explicit
  logging" posture, not middleware-inferred).
- No link from `Finding.supportingEvidence` to a real `EvidenceItem` — that field, added by
  `investigations`, remains free text. Wiring it into a real relation once both modules existed
  was considered and deliberately deferred rather than done as an unrequested follow-on change to
  an already-shipped module; a future pass can add an optional `evidenceItemId` there if wanted.
- No bulk/batch ingest — one `POST .../evidence` call ingests exactly one item; no ZIP/multi-file
  upload endpoint.
- No real source-system integration — `.../confirm` and `.../reject` are exercised manually by an
  authorized human; there is no inbound webhook, no outbound call to a core banking/card-processor
  API, and no retry/timeout handling for a request that never gets a response. A `REQUESTED`
  containment request can sit in that state forever with nothing watching it.
- No link from a `ContainmentRequest` to a specific account/card/transaction record —
  `targetDescription` is free text, same posture as `Finding.supportingEvidence` and
  `EvidenceItem.externalRef`, because no `Party`/`Account`/`Transaction` entity exists yet in this
  codebase (architecture.md's data model names them as future Case sub-entities, not built).
- No case-level "contained" summary/badge computed from its `ContainmentRequest`s — deliberate,
  see the module's own README section above for why a derived flag was avoided; a future frontend
  would compute "is this case contained" by checking whether any request is `CONFIRMED`, not by
  reading a stored field.
- No link from a ledger entry to a specific transaction/account record — same free-text-only
  posture as `ContainmentRequest.targetDescription`/`EvidenceItem.externalRef`, because no
  `Party`/`Account`/`Transaction` entity exists yet in this codebase.
- No multi-currency support — every amount is assumed NGN; a case with genuinely mixed-currency
  losses/recoveries would need this module extended, not something silently handled today.
- No correction/reversal endpoint — a wrong loss or recovery entry is corrected by recording a
  new offsetting entry (e.g. a negative-sense `OTHER` recovery), the same "the ledger is the
  record, never edit history" posture as `Interview`/`Finding`; there's no dedicated "void this
  entry" action.
- No write-off ceiling/validation against the linked approval's own severity band or amount — CD-04
  names `amountBandsNgn` as a real input to *which* approver is required, but that value is seeded
  `null` (Board Risk Committee's to set, not EFIMS's to invent — see CD-04's own doc), so nothing
  here checks a write-off amount against a band; only that *an* approval of the right action type
  exists and hasn't been used yet.
- No due-date/overdue tracking beyond the stored `dueDate` field itself — no computed
  `isOverdue`, no notification when an action passes its due date, no scheduled sweep (unlike
  `SlaClockService`'s breach sweep or `NotificationsService`'s escalation sweep). A caller has to
  compare `dueDate` to "now" itself.
- No reassignment endpoint — `ownerId` is set once at creation; there's no `PATCH`-style route to
  hand an action to a different owner without cancelling and recreating it.
- No CD-04 approval gate — deliberate, see the module's own README section above; not a gap
  against CD-04, since CD-04 doesn't name CAPA as one of its four actions at all.
- No link from a `CapaAction` back to a `Finding`/`InvestigationIssue` it addresses beyond the
  optional `RootCauseAnalysis` link — a CAPA action can't be tied directly to the specific
  investigation finding that prompted it, only to the case-level root cause narrative.
- No real regulator-facing integration — `submit`/`acknowledge` are exercised manually by an
  authorized human; there is no outbound call to a filing portal (e.g. NFIU's goAML) and no
  inbound webhook for a regulator's own acknowledgment.
- No resubmission/correction workflow — `submit` only accepts a `PENDING` obligation; a submitted
  filing that needs correcting has no dedicated path in this module (a new obligation would need
  to be raised, matching this module's deliberately simple scope).
- No overdue/deadline tracking beyond the stored `deadline` field itself — no computed
  `isOverdue`, no notification when an obligation passes its statutory deadline, no scheduled
  sweep. Same gap `capa`'s `dueDate` has, not treated differently here.
- **`SlaClock` still has no link to `RegulatoryObligation`** — CD-03's "statutory deadlines are
  never paused" is enforced at the schema level for `RegulatoryObligation.deadline` itself (no
  pause mechanism exists near that field at all, see this module's own README section above), but
  a *SLA clock* tracking the same underlying deadline still has no way to be marked as statutory
  and therefore un-pausable — that gap, flagged in the `workflow`/`cases` sections above, is
  closed for obligations tracked in this module directly, not for `SlaClock` itself. Retrofitting
  an optional link onto the already-shipped `SlaClock` model was considered and deliberately
  deferred rather than made as an unrequested change to a module that already shipped — same
  reasoning `evidence`'s section above gives for not retrofitting `Finding.supportingEvidence`.
- **No Redis** — rate limiting and caching both use in-memory stores, which only work correctly
  on a single instance (two instances would each enforce their own separate rate-limit counters
  and cache, not a shared one). Deferred deliberately, matching architecture.md §6's own trigger
  condition for Redis ("real caching/session-scale need arises") — revisit if/when this deploys
  multi-instance, not before.
- **No distributed job scheduling** — `SlaClockService`'s breach sweep and
  `NotificationsService`'s escalation sweep (`@nestjs/schedule`, in-process cron) both assume a
  single running instance. Two instances would both run every sweep, which is at worst redundant
  work here (both would find the same already-marked-notified rows and no-op) rather than
  duplicate notifications, but it's not designed for multi-instance and hasn't been tested that way.
- **Socket.IO has no session-revocation awareness** — a logged-out/revoked refresh token doesn't
  drop an already-connected socket; the connection stays open (and keeps receiving pushes) until
  its access token naturally expires (`JWT_ACCESS_TTL`, default 15m). See the doc comment on
  `RealtimeModule` for why this wasn't built now (no forced-disconnect mechanism exists to push a
  "your session was revoked, disconnect" signal to a specific user's open sockets).
- **CORS on the Socket.IO gateway is permissive** (`origin: true`), unlike the Express CORS
  allow-list — a deliberate, documented difference, not an inconsistency nobody noticed. See the
  doc comment on `RealtimeGateway` for why the mandatory JWT handshake is this gateway's real
  access-control boundary, not CORS (unlike a cookie-authenticated endpoint, there's no ambient
  session for a malicious cross-origin page to ride along on).
- **No automated test suite** — `npm test` (jest) has no spec files yet; every verification in
  this project so far has been live/manual (see every module's own README section and
  `docs/CHANGELOG.md`). `test/manual/realtime-notifications.manual.js` is a manual/e2e helper
  against a running app + seeded database, not a jest spec — it won't run under `npm test`.
- **`npm audit` flags real vulnerabilities**, mostly requiring a NestJS v10 → v12 major-version
  upgrade to fully resolve (not done here — too large and risky a change to make unprompted
  mid-build; see `docs/CHANGELOG.md`'s cross-cutting-infrastructure entry for the specifics).
  Most of the remaining ones are dev-tooling-only (`@nestjs/cli`'s own dependency tree — `glob`,
  `webpack`, `inquirer` — with no exploitable path through this project's actual runtime usage),
  but this is a known, tracked gap, not a clean bill of health.
