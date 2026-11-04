# EFIMS — MVP System Design

> Source: `Integrate_Fraud_System_Design.pdf`. Covers backend, frontend, and database for the
> MVP build using the confirmed toolset (Render hosting, PostgreSQL, NestJS, Next.js, Groq for AI —
> no Redis/Kafka/Temporal yet). Translates the full SAD architecture down to what actually gets
> built first.

## 1. Architecture Overview

Three deployed pieces, all on Render:

- **Frontend** — Next.js/TypeScript web service, calls the backend over REST.
- **Backend** — NestJS/TypeScript, a single deployable service internally split into
  strongly-bounded modules (a modular monolith, not microservices — deliberate, since a
  one-developer team can't operate a dozen independently-deployed services without the
  overhead outweighing the benefit).
- **Database** — PostgreSQL (Render-managed), with Row-Level Security (RLS) enforcing tenant
  isolation at the database engine level, not just in application code.

The backend's `ml-gateway` module is the only code path allowed to call the AI service (Groq
for now). Business modules never call it directly — this keeps the "AI is advisory,
human-overridable" rule enforced in one place instead of scattered through the codebase.

No message queue, cache, or workflow engine yet — those are deferred until a phase actually
needs them (§6).

## 2. Backend — Module Structure

```
efims-backend/
├── src/
│   ├── modules/
│   │   ├── identity/         (users, roles, auth, delegation)
│   │   ├── incidents/        (intake, dedupe, classification)
│   │   ├── triage/           (severity engine, routing, escalation)
│   │   ├── cases/            (case record, team, status history)
│   │   ├── workflow/         (state machine, SLA clocks, approvals)
│   │   ├── investigations/   (plans, issues, interviews, findings)
│   │   ├── evidence/         (vault, hashing, custody, legal hold)
│   │   ├── containment/      (action requests, confirmations)
│   │   ├── recovery/         (loss/recovery ledger, reconciliation)
│   │   ├── capa/             (root cause, actions, validation)
│   │   ├── regulatory/       (obligations register, submissions)
│   │   ├── notifications/    (templates, delivery, escalation)
│   │   ├── configuration/    (taxonomy, SLA, rules — versioned, per CD-01–CD-08)
│   │   └── audit/            (append-only ledger, write-only API)
│   ├── ml-gateway/           (single client to Groq — nothing else calls it)
│   ├── infrastructure/
│   │   └── database/ storage/ security/
│   └── common/ guards/ decorators/ events/ validation/
```

### Module boundary rules (non-negotiable even at MVP scale)

- Modules talk to each other only through their own public service interface or an
  in-process event emitter — never by reaching into another module's database tables
  directly.
- The `audit` module exposes a write-only API to everything else — nothing outside it can
  update or delete an audit row, including via raw SQL.
- The `ml-gateway` module is the only caller of Groq. This is what keeps "no autonomous
  adverse action, every AI output is advisory and human-overridable" enforceable in one
  place instead of scattered across modules.

### MVP build order

The modules that matter for a working demo, before the rest:

`identity` → `configuration` → `incidents` → `triage` → `cases` → `workflow` → `audit`

Evidence, containment, recovery, CAPA, regulatory, and notifications can follow once the core
incident-to-case flow works end-to-end.

## 3. Frontend

- Next.js (App Router) + TypeScript + Tailwind + shadcn/ui.
- Talks to the backend exclusively via REST; no direct database access from the frontend, ever.
- Auth session is a signed token issued by the backend's `identity` module; the frontend
  never talks to the database or to Groq directly.
- Deployed on Render as its own web service (separate from the backend), since Next.js with
  server-rendered routes needs an always-on process, not a static export.

## 4. Database — Data Model & Tenancy

### 4.1 Core modeling decision: Signal → Incident → Case

This is the single most important modeling choice in the schema — **do not model Incident
and Case as the same table/entity.**

```
Signal (alert, report, event)
    │ validated, deduplicated
    ▼
Incident ─────────────────┐
    │            │ many incidents
    │ meets case │ may link to one
    │ criteria?  │  case (or none)
    ▼            │
Case ◄────────────┘
    ├── Parties, Transactions
    ├── Evidence, Findings
    ├── Tasks, Approvals
    ├── Loss / Recovery
    ├── Regulatory Obligations
    ├── CAPA
    └── Audit Events (every change, on all of the above)
```

Example ratio to expect: 100 alerts → ~15 incidents (after dedupe) → ~3 cases (after linking).

### 4.2 Multi-tenancy — Row-Level Security

- Every tenant-scoped table carries a `tenant_id` column.
- A Postgres RLS policy on each such table enforces
  `tenant_id = current_setting('app.current_tenant')` (or equivalent) on every query —
  enforced by the database engine itself, regardless of what the application code does.
- A tenant-context middleware in NestJS sets the active tenant for each request from the
  authenticated user's signed claim, before any query runs. RLS is the backstop if that
  middleware ever has a bug.
- At MVP stage there's only one tenant (Bank 1) live, but every table is built tenant-scoped
  from the first migration — retrofitting tenancy later is far more expensive than building
  it in now.
- A separate **control plane** (outside any tenant's own scope) holds `Tenant`,
  `TenantConfiguration`, and `TenantProvisioningRecord` — this is where the CD-01–CD-08
  configuration values live, versioned with effective date, author, and approver.

### 4.3 Access control (enforced in the backend, RLS is the backstop)

A request is only granted access to a case if **all** of the following hold:

```
user.tenantId == case.tenantId          (also enforced by RLS)
AND user.role permits the requested action
AND user.team == case.assignedTeam (or elevated role)
AND user.id NOT IN case.subjects        (not under investigation)
AND user.id NOT IN case.conflicts       (no declared conflict)
AND user.clearance >= case.sensitivity
AND case.compartment IN user.authorisedCompartments
→ otherwise: DENY, and the denial itself is written as an audit event
```

The tenant check is deliberately first and is the one check enforced twice (application
layer + RLS), because cross-bank data leakage is the single most damaging failure mode for a
multi-bank SaaS product.

### 4.4 Sensitive compartments

Not every case is visible the same way. Compartments to build from day one: `STANDARD`
(default), `AML_MLRO` (STR/SAR, anti-tipping-off controls), `WHISTLEBLOWING` (reporter
identity kept in a separate vault from case content), `LEGAL_PRIVILEGE`, `HR`, `EXECUTIVE`.
Each case record carries a compartment; a user only sees it if their
`authorisedCompartments` includes it.

## 5. Integration Pattern (No Kafka Yet)

- Modules communicate in-process via an event emitter — no external message broker at MVP
  scale.
- Any call to an external system (a source-system containment request, a regulator
  submission) goes through a boundary that does schema validation, retries with backoff, and
  a dead-letter path for anything that can't be processed — the pattern is the same whether
  the transport is in-process or (later) Kafka, so switching transports later doesn't mean
  re-architecting.

### Containment orchestration (mandatory pattern, even at MVP)

```
EFIMS ──ContainmentRequested──► Source system (core banking/cards)
                                      │
EFIMS ◄──ActionConfirmed/Failed──────┘
   │
   ▼
Case updated · audit event written
```

No case is ever shown as "contained" until a positive confirmation comes back. EFIMS never
freezes an account or blocks a card itself.

## 6. What's Deliberately Not in the MVP (and when it comes back)

| Deferred | Comes back when |
|---|---|
| Redis | Real caching/session-scale need arises, or background job volume outgrows in-process handling |
| Kafka/RabbitMQ | Phase 3, once 2+ real external event producers exist (core banking + SIEM + a regulatory scheduler, for example) |
| Temporal | Phase 2, once approval/evidence workflows genuinely span multiple weeks with pause/resume needs |
| OpenSearch | Phase 4, when full-text/fuzzy case search becomes a real usability need (Postgres full-text search covers MVP) |
| Neo4j | Phase 4, only if relationship/typology analysis becomes an active, funded use case (Postgres recursive queries cover basic lookups until then) |
| Kubernetes | Deferred until production load or the bank's platform standard requires it |

## 7. Security Notes Carried Into the MVP (Not Optional)

Even at MVP scale, these are built in from the start, not bolted on later:

- **Evidence integrity**: hash on ingest + custody log, so tampering is detectable.
- **Audit log integrity**: append-only, write-only API — no update/delete path exists,
  including via direct SQL.
- **Cross-tenant leakage**: RLS is the backstop even with one tenant live, so the second
  tenant's onboarding doesn't require a security re-architecture.
- **AI data boundary**: only `ml-gateway` talks to Groq; nothing else does, and nothing sent
  to it is ever used to make an autonomous decision.

## 8. Deployment Topology (Render)

| Service | Render resource | MVP tier |
|---|---|---|
| Frontend | Web service | Starter (~$7/month) |
| Backend | Web service | Starter (~$7/month) |
| Database | Managed Postgres | Basic-256mb to Standard (~$7–20/month) |

Two environments minimum: staging and production, each with its own Postgres instance and
its own tenant-context configuration — staging never points at production data.
