# EFIMS — Architecture Decision Record

Running log of non-obvious architectural decisions: date, context, decision, alternatives
rejected, consequences. Add an entry whenever a decision isn't fully explained by the code itself
or by `docs/architecture.md`'s own stated rules. Newest entries at the top.

---

## 2026-11-10 — Custom JWT auth instead of Keycloak/Entra (backfilled)

**Context**: `identity` needed a real authentication/authorization system from the MVP build's
first module, for a single-developer team building a modular monolith with no existing IdP
relationship with any pilot bank yet.

**Decision**: hand-rolled JWT issuance/verification inside `identity` — short-lived access tokens,
longer-lived refresh tokens, both stored as the backend's own signed tokens in `HttpOnly` cookies
on the frontend (not re-wrapped in a second session format). A structurally separate
`PlatformUser` layer (see below) gets its own JWT secret and guard, entirely independent of the
tenant-scoped token system.

**Alternatives rejected**: Keycloak or Entra ID as a managed IdP from day one. Rejected for MVP
because (a) no pilot bank relationship yet dictates which IdP they'd actually want federated via
OIDC, (b) standing up and operating a Keycloak instance is itself infrastructure the architecture
doc's own "defer until a phase needs it" principle (§6) argues against at this stage, and (c) the
case-access authorization model (non-negotiable #6 — tenant/role/team/clearance/compartment, all
enforced in application code plus RLS) doesn't change shape based on where the identity claim
originates; building it against a local JWT first doesn't block federating it later.

**Consequences**: real bank pilots will likely want their own IdP federated (SSO) eventually — this
is now explicitly tracked as a production-hardening work item (an OIDC adapter seam behind the
existing authorization logic, so swapping identity providers doesn't mean rewriting case-access
rules). Until then, password-based login is the only path, which is why real login brute-force
throttling was treated as a non-optional security patch rather than a nice-to-have.

---

## 2026-10-14 — 20-value `Role` enum stays a flat scalar, not a Role/Permission model (backfilled)

**Context**: an external role/dashboard/permission brief asked for a much richer ~20-role
authorization model with per-role dashboards and nav scoping. The existing `Role` was an 8-value
Prisma enum, a flat scalar column on `User`.

**Decision**: expand the enum to 20 values in place, keep it a flat scalar. Centralize the
previously 9x-duplicated per-controller role-list constants into one shared
`src/common/constants/roles.ts` rather than inventing a new permission abstraction.

**Alternatives rejected**: a many-to-many `Role`↔`Capability` (or `Role`↔`Permission`) model,
considered and explicitly deferred as "the schema's own documented future seam." Rejected for this
pass because the brief's actual ask (20 distinct dashboards/nav scopes) doesn't yet need
per-capability granularity — every real authorization check in this codebase so far is "does this
actor's role appear in this fixed list for this action," which a flat enum answers as well as a
many-to-many model would, with far less schema/migration complexity for a single-developer team to
carry.

**Consequences**: a user can hold exactly one role at a time — this is why the seeded `ADMIN` user
can't also hold a business role, which is why the project's recurring end-to-end verification
always creates a disposable second test user rather than reusing admin for role-gated flows. Also
why, when the user wanted a stricter "no default business-content access" admin tier, that became a
new structural layer (`PlatformUser`, below) rather than a change to `ADMIN`'s own behavior — the
flat-enum constraint made "admin that can also just not have business access" awkward to express in
place. The enum is now large enough (20 values) that the capability/permission generalization is a
live, explicitly tracked candidate for the next phase of hardening, not a hypothetical.

---

## 2026-10-14 — `PlatformUser`: a structurally separate cross-tenant layer, not a renamed `ADMIN` (backfilled)

**Context**: reviewing whether to narrow tenant-scoped `ADMIN`'s existing blanket bypass (per the
external brief's "no default business-content access for admins" principle) surfaced a real,
larger need: genuine multi-tenant operation needs *someone* who can list/provision/suspend tenants
from outside any single tenant's own scope — a role that structurally cannot exist inside the
per-tenant `Role` enum, since every value of that enum is, by definition, scoped to one tenant.

**Decision**: a new `PlatformUser` model — not a `Role` enum value, no `tenantId` column, not
subject to RLS at all (it lives in the control plane alongside `Tenant`/`TenantConfiguration`). Its
own JWT secret (`PLATFORM_JWT_SECRET`, distinct from the tenant system's `JWT_ACCESS_SECRET`), own
guard (`PlatformAuthGuard`, entirely separate from `RolesGuard`), own login route, own frontend
shell (`/platform/*`, deliberately visually distinct — no sidenav, no case/incident nav — so it's
never ambiguous which context an operator is in).

**Alternatives rejected**: adding a `SUPER_ADMIN` value to the existing `Role` enum. Rejected
because that value would still be a *tenant-scoped* row (it would need a `tenantId`, like every
other `User`), which can't express "sees every tenant" without special-casing that one enum value
everywhere RLS and the case-access rule currently assume "this user belongs to exactly one tenant."
A bug in that special-casing would be a direct path to cross-tenant data leakage — the single most
damaking failure mode this system is built to prevent (per `architecture.md §4.3`). A structurally
separate model with its own guard means a bug in the tenant-scoped RBAC system cannot, by
construction, grant platform power, and vice versa.

**Consequences**: the platform layer currently has no enforced restriction on *which* control-plane
data it can see beyond "not RLS'd" — it was built to list/provision/suspend tenants, not to read
tenant business data, but nothing yet technically prevents a bug here from reaching tenant tables
if a future endpoint were added carelessly. Locking this down with its own restricted database role
and grants is now an explicit, tracked hardening item, not yet done.

---

## 2026-11-10 — In-memory cache and rate limiter instead of Redis (backfilled)

**Context**: `architecture.md §6` already named Redis as deferred "until a phase actually needs
it" — the MVP build needed *some* caching and rate-limiting behavior (response caching,
login-throttling) without standing up external infrastructure for a single-instance deployment.

**Decision**: NestJS's built-in in-memory cache manager and `@nestjs/throttler`'s default
in-memory store, plus `@Cron` jobs (e.g. the SLA-breach sweep) running in-process on the one
backend instance.

**Alternatives rejected**: Redis-backed cache/rate-limiter/job scheduling from the start. Rejected
because standing up and operating Redis is exactly the kind of infrastructure `architecture.md §6`
argues against taking on before it's needed, and at single-instance deployment scale, in-memory
state is strictly simpler and has identical observable behavior to a shared store.

**Consequences, now a confirmed and explicitly tracked risk**: every one of these — cache,
rate-limiter, cron jobs — is correct *only* because deployment is explicitly single-instance today.
The moment a second backend instance exists (horizontal scaling, or even two instances briefly
overlapping during a rolling deploy), this becomes a real correctness bug: stale cached config
diverging between instances, duplicate SLA-breach sweeps firing from both instances, and
non-shared rate limits meaning an attacker can get 2x (or Nx) the intended login attempts by
hitting different instances. This is flagged in `docs/CHANGELOG.md`'s 2026-11-02 audit entry and
is a named target of the current production-hardening pass (Phase 4: transactional outbox,
idempotent/lock-guarded cron jobs, a durable login-throttle store).

---

## 2026-11-10 — In-process event bus instead of Kafka/RabbitMQ (backfilled)

**Context**: `architecture.md §5` specifies modules communicate in-process via an event emitter,
with external message-broker integration explicitly deferred to "Phase 3, once 2+ real external
event producers exist."

**Decision**: a plain in-process `EventEmitter`-based bus inside the NestJS monolith. Any call to
an actual external system (containment requests to a source system, regulator submissions) already
goes through its own boundary with schema validation and retry/dead-letter handling, independent of
whether the internal transport is in-process or (later) Kafka — the pattern was deliberately chosen
so the transport can change without re-architecting the boundary logic around it.

**Alternatives rejected**: Kafka or RabbitMQ from the start. Rejected for the same reason as Redis
above — no real external event producer exists yet to justify the operational cost, and the
single-deployable modular-monolith decision (`architecture.md §1`) would be partly undermined by
introducing a message broker whose main value is coordinating *independently deployed* services.

**Consequences**: in-process events are delivered synchronously within the same process and are
lost if the process crashes mid-dispatch — there is currently no durability guarantee for an event
that was emitted but not yet fully handled. This is acceptable today because nothing safety-critical
depends solely on an in-process event surviving a crash (containment confirmations, for example,
are driven by an explicit external callback, not an internal event, per non-negotiable #8). A
transactional outbox pattern (Postgres-backed, no broker) is the tracked hardening path for the
handful of cases where that durability guarantee actually matters (containment requests, SLA/
regulatory-deadline notifications), rather than introducing Kafka/RabbitMQ.

---
