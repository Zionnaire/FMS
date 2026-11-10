# EFIMS backend — e2e test suite

## Test database

These tests run against a real Postgres database — real RLS, real constraints, real grants —
never mocks, per this project's own CLAUDE.md non-negotiable rules and the production-hardening
plan's explicit instruction ("not mocks for anything touching RLS").

No Docker is available in this development environment, so `docker-compose`/Testcontainers
(the plan's suggested approach) isn't an option here. Instead: **`efims_test`**, a separate
database on the same Postgres instance/project this codebase's dev environment already uses
(created via `CREATE DATABASE efims_test;` as the privileged owner role) — logically isolated
from the dev/seed database (`neondb`) so tests can freely truncate/insert without ever touching
real dev-seeded data, while still being a genuine Postgres instance with real RLS enforcement.

If you move this project to an environment with Docker available, swapping in a
`docker-compose.yml`-based Postgres (or Testcontainers) is a drop-in replacement: point
`test/e2e/.env.test`'s `DATABASE_URL`/`DIRECT_URL` at that instead, re-run the one-time setup
below, and nothing else in this suite changes.

### One-time setup (already done for this environment; re-run if the test database is ever reset)

```bash
# 1. Create the database (run once, as a role with CREATEDB — e.g. Neon's own owner role)
psql "$DIRECT_URL" -c "CREATE DATABASE efims_test;"

# 2. Point test/e2e/.env.test's DATABASE_URL/DIRECT_URL at efims_test (same host/credentials,
#    different database name) instead of the dev database.

# 3. Apply the schema and RLS policies to it, same as any fresh environment would:
node -e "require('dotenv').config({ path: 'test/e2e/.env.test' }); require('child_process').execSync('npx prisma migrate deploy', { stdio: 'inherit', env: process.env });"
node -e "require('dotenv').config({ path: 'test/e2e/.env.test' }); require('child_process').execSync('npx prisma db execute --file prisma/rls-policies.sql --schema prisma/schema.prisma', { stdio: 'inherit', env: process.env });"
```

`test/e2e/.env.test` uses its own JWT secrets (never the real dev/prod ones) and its own port —
none of it overlaps with a real running dev instance, so the e2e suite can run alongside
`npm run start:dev` without interfering with it.

## Running

```bash
npm run test:e2e
```

Runs serially (`maxWorkers: 1`, see `jest-e2e.config.js`'s own comment) — every spec file shares
one physical database, and this project's own transaction-per-request pattern makes concurrent
spec files a real risk of cross-test interference, not just a speed tradeoff.

`global-setup.js` truncates every table before the run starts (via the privileged `DIRECT_URL`
connection, which bypasses RLS by design — `efims_app` itself isn't granted `TRUNCATE` on most
tables, deliberately, per `rls-policies.sql`). It refuses to run at all unless `DIRECT_URL`
contains `efims_test`, specifically so a misconfigured env can never truncate the real dev
database.

## What's covered (Phase 1 of the production-hardening plan)

- `tenant-isolation.e2e-spec.ts` — every RLS-enabled table (enumerated dynamically from
  `pg_class`/`pg_namespace`, not a hardcoded list), proven both through the real HTTP layer and
  through a raw `efims_app` database session with no tenant context set.
- `case-access-matrix.e2e-spec.ts` — each of the 7 case-access conditions (tenant, role, team,
  subject, conflict, clearance, compartment) failing independently, plus the all-pass case, each
  asserting both the denial and the audit event it produces.
- `audit-integrity.e2e-spec.ts` — append-only grants, hash-chain verification on fresh data,
  `canonicalize()`'s handling of `Date`/nested objects/`undefined`, concurrent-write safety.
- `containment-gate.e2e-spec.ts` — a containment request can never reach `CONFIRMED` without an
  explicit, authenticated confirmation call.
- `auth.e2e-spec.ts` — login throttling, refresh rotation + reuse detection, expired/tampered
  tokens, platform tokens rejected on tenant routes and vice versa.
- `ai-advisory-boundary.e2e-spec.ts` — the ml-gateway suggestion endpoints never write a
  `TriageAssessment`, and degrade to a clean `503` when unconfigured.

Not yet covered (explicitly out of scope for this first pass, tracked in `docs/OPEN_ITEMS.md`):
component/unit tests for individual services in isolation, frontend Playwright e2e (a separate,
not-yet-started piece of this same phase), and a code-coverage threshold gate (a coverage report
is produced; no number is being chased yet — see the plan's own "do not chase a number" guidance).
