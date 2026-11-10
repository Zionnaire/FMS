# EFIMS — System Handover for Independent Analysis

> **Purpose of this document**: a self-contained snapshot of what EFIMS is, what has been built,
> what has been verified, and what is known to still be missing or risky — written so an AI session
> with no access to this repository (e.g. a separate claude.ai web conversation) can perform a
> meaningful, independent system analysis without first having to reconstruct this context from
> scratch. Everything below reflects the state of the project as of **2026-11-10**.
>
> This is a handover snapshot, not a living document — if you're reading this inside the actual
> repo rather than having been handed it, prefer `CLAUDE.md` and `docs/CHANGELOG.md` for the
> current, maintained state.

---

## 1. What EFIMS is

**EFIMS** = Enterprise Financial Crime & Incident Orchestration Platform.

A multi-tenant SaaS for banks (Bank 1 is the first tenant) to manage the full lifecycle of a
financial-crime or operational incident: intake, triage, case investigation, containment,
recovery, CAPA (corrective/preventive action), regulatory reporting, and audit — with AI used
only in an **advisory, human-overridable** capacity, never to take an autonomous action.

The name promises two things: "Incident Management" (the workflow/process backbone) and
"Intelligence" (AI-assisted analysis). For most of this project's life, only the first half
existed; the second half was built for the first time in the most recent work session (see §6).

## 2. Confirmed toolset (not negotiable without a deliberate re-scoping decision)

- **Frontend**: Next.js 16 (App Router) + TypeScript + Tailwind v4 + shadcn/ui. Talks to the
  backend only via REST. The browser never talks to the database or to the AI provider directly —
  enforced partly by convention and partly as a real build-time guarantee (`backend-client.ts`
  imports `server-only`, so leaking the backend's URL into a client bundle is a compile error, not
  just a code-review concern).
- **Backend**: NestJS/TypeScript, a modular monolith (deliberately not microservices — a
  single-developer team can't operate a dozen independently-deployed services without the
  operational overhead outweighing the benefit). Target deploy: Render.
- **Database**: PostgreSQL (Render-managed / Neon in this dev environment), with Row-Level
  Security enforcing tenant isolation at the database engine level, not just in application code.
- **AI**: Groq, called only through the backend's `ml-gateway` module — no other code path is
  permitted to call it. Uses the `openai` npm SDK pointed at Groq's OpenAI-compatible base URL.
- **Deliberately deferred until a phase actually needs them**: Redis, Kafka/RabbitMQ, Temporal,
  OpenSearch, Neo4j, Kubernetes. Each has a documented trigger condition in `architecture.md §6`
  (e.g. Kafka waits for 2+ real external event producers; Temporal waits for workflows that
  genuinely span weeks with pause/resume needs).

## 3. Non-negotiable architectural rules

These are treated as hard constraints, re-checked on every new feature, not just aspirational
guidelines:

1. **Signal → Incident → Case are three distinct entities**, never collapsed into one
   table/concept. Example ratio: ~100 signals → ~15 incidents (after dedup) → ~3 cases (after
   linking).
2. **Modules talk only through their own public service interface or an in-process event
   emitter** — never by reaching into another module's tables directly. (A real violation of this
   was caught mid-implementation during the most recent work session — see §6.)
3. **`audit` is write-only from the outside** — append-only, no update/delete path for any audit
   row, enforced at the database grant level (`REVOKE UPDATE, DELETE ... FROM efims_app`), not just
   in application code. Even a genuine historical bug in audit data is fixed by correcting the code
   going forward, never by rewriting the ledger (see §6's hash-chain bug writeup for the concrete
   precedent this project follows).
4. **`ml-gateway` is the only caller of Groq.** No autonomous adverse action (containment,
   write-off, disciplinary action, regulatory submission) ever fires without a human approval step.
5. **Tenant isolation is enforced twice**: an application-layer tenant-context middleware sets the
   active tenant per request, and Postgres RLS is the backstop
   (`tenant_id = current_setting('app.current_tenant')` on every tenant-scoped table). Confirmed
   directly against the database repeatedly: a raw `efims_app` session with no tenant context set
   sees zero rows even when real rows exist.
6. **Case access requires ALL of**: tenant match, role permission, team match (or elevated role),
   user not a subject/conflict on the case, user clearance ≥ case sensitivity, case compartment ∈
   user's authorised compartments. Any denial is itself written as an audit event.
7. **Compartments from day one**: `STANDARD`, `AML_MLRO`, `WHISTLEBLOWING` (reporter identity kept
   in a separate vault from case content), `LEGAL_PRIVILEGE`, `HR`, `EXECUTIVE`.
8. **Containment is confirmation-gated**: EFIMS never shows a case as "contained" until a positive
   `ActionConfirmed` comes back from the source system. EFIMS never freezes an account or blocks a
   card itself — it only requests and waits.
9. **The CD-01–CD-08 configuration values (§5) are working defaults for build purposes, not yet
   formally ratified policy.** Every one of the 8 items is still a `Draft` per the register's own
   ratification tracker — none may be represented to a bank, regulator, or stakeholder as final.

## 4. Data model — the core shape

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

Every tenant-scoped table carries a `tenant_id`. A separate control plane (outside any tenant's own
scope) holds `Tenant`, `TenantConfiguration`, and `TenantProvisioningRecord`.

## 5. Configuration decisions register (CD-01 to CD-08)

All eight are implemented as **versioned, per-tenant configuration** (not hardcoded), but **all
eight remain unratified drafts** — this is a real, confirmed gap, not an oversight:

| Item | Owner | What it covers | Status |
|---|---|---|---|
| CD-01 | Fraud Risk | 3-level incident taxonomy (Category → Type → Sub-type) | Draft |
| CD-02 | Risk / Executive | Severity thresholds S1–S4 (loss/customer-impact/regulatory/containment-urgency criteria) | Draft — actual Naira thresholds pending |
| CD-03 | Operations | SLA calendars (24×7 vs. business-hours) | Draft |
| CD-04 | Governance | Approval matrix (amount × severity × action type) | Draft — amount bands pending |
| CD-05 | Legal/Records | Retention schedule per record class | Draft — needs formal NDPA/AML validation |
| CD-06 | Sponsor | Historical migration scope | Draft — cutover date pending |
| CD-07 | Technology | RTO/RPO targets per function tier | Draft — pending a real Business Impact Analysis |
| CD-08 | Model Governance | AI use-case release scope, phased (see §6) | Draft |

CD-08's phased AI roadmap is the direct justification for what `ml-gateway` builds and doesn't:

| Phase | Capability | Guardrail |
|---|---|---|
| Phase 2 (built) | Severity-suggestion, duplicate-detection | Advisory score + confidence + cited factors only; human sets final severity |
| Phase 3 (not built) | Narrative/entity extraction from free text | Every extracted fact source-cited back to original text |
| Phase 4 (not built) | Anomaly/typology detection, recovery-propensity model | Feeds triage/prioritization only — never auto-closes/escalates/files |
| Phase 5 (not built) | Case summarisation / AI assistant | Citations mandatory; UI must warn against treating as authoritative |

## 6. Current build status

### 6.1 Backend (`efims-backend/`) — all 14 modules scaffolded, migrated, RLS-applied

`identity`, `configuration`, `incidents`, `triage`, `cases`, `workflow`, `audit`, `notifications`,
`investigations`, `evidence`, `containment`, `recovery`, `capa`, `regulatory` — every module named
in the architecture doc's module map exists and has been live-verified against a real Postgres
database (Neon), including repeated direct confirmation of RLS tenant isolation and the full
7-condition case-access rule (§3 item 6). Cross-cutting infrastructure also shipped: rate limiting,
in-memory caching (Redis deliberately still deferred), security headers/CORS, health checks,
pagination, an in-process event bus, and a JWT-authenticated Socket.IO realtime gateway.

**`ml-gateway` — built for the first time in the most recent session, previously zero lines of
code despite being named in the project's own README since day one.** Implements exactly CD-08
Phase 2:
- `MlGatewayService` — the sole Groq caller anywhere in the codebase, using the `openai` SDK
  pointed at Groq's base URL. Degrades to a clean `503` (not a crash) when unconfigured.
- Severity suggestion (`GET /incidents/:id/triage/suggestion`) — advisory, read-only, never writes
  a `TriageAssessment`.
- Duplicate/correlation detection (`GET /incidents/:id/similar`) — same advisory posture, wires to
  the already-existing `relate`/`merge` actions.
- **Now verified against a real Groq API key** (not just the unconfigured 503 fallback): a real
  severity suggestion returned `S4`/92% confidence with sane cited factors for a no-loss test
  incident; a real similarity scan correctly scored true near-duplicate incidents at ~0.99 versus
  0.40–0.55 for same-category-only matches.

A 20-value per-tenant `Role` enum (expanded from an original 8) plus a structurally separate
cross-tenant **platform/super-admin layer** (`PlatformUser` — not a `Role` value, no `tenantId`,
not RLS'd, its own JWT secret/guard/login) exist for real multi-tenant provisioning: listing
tenants, provisioning a new one, suspending/reactivating. `UserCompartmentGrant` supports
temporary/expiring grants; an `AccessChangeRequest` maker-checker flow governs role/compartment
changes (no direct unmediated endpoint to change either).

**Known, confirmed, currently-unaddressed gaps** (from a 2026-11-02 production-readiness audit —
real findings, not yet acted on except where noted):
- **Zero automated tests in either app.** Every "live-verified" claim in this project's history is
  a manual Playwright/curl script run from a scratch folder, never committed to the repo.
- **No deployment pipeline** — no `Dockerfile`, `render.yaml`, or CI/CD anywhere, despite being
  described as "deployed to Render."
- **The in-memory cache, rate limiter, and `@Cron` jobs are all single-instance-only** — correct
  today only because deployment is explicitly single-instance; would become a real correctness bug
  (stale config across instances, duplicate SLA-breach sweeps, non-shared rate limits) the moment a
  second backend instance exists.
- **No regulator-grade audit export** (API-only, capped at 200 rows), no legal/compliance docs
  (privacy policy, ToS, DPA/GDPR/NDPA material), no backup/DR operationalization beyond CD-05/
  CD-07's paper policy, no EFIMS-specific incident-response runbook, no tenant
  billing/offboarding/data-export flow.
- **Backend has 17 remaining npm production-path vulnerabilities** requiring a NestJS 10→12 major
  version bump across nearly every `@nestjs/*` package simultaneously — deliberately deferred as
  its own dedicated upgrade, not bundled into a routine patch sweep. (The one *critical* backend
  finding, `handlebars` via `@nestjs/cli`, was build-time-only and has been fixed.)
- **~27 of 35 reference mockup screens have no corresponding built page** (MFA, whistleblower
  portal, network graph, STR form generator, alert rule engine, and others) — some may be
  deliberately out of MVP scope; not yet confirmed one by one.

**Security patches already applied**: frontend's critical unauthenticated Next.js RCE fixed
(root cause was a dev-only CLI tool misplaced in `dependencies` rather than `devDependencies`,
pulling its whole build-tool tree into the vulnerability scan — now 0 production-path frontend
vulnerabilities); backend's one critical (build-time-only `handlebars`) fixed; real login
brute-force throttling added on both the tenant and platform login routes (verified: 6th attempt
within 60s correctly 429s).

### 6.2 Frontend (`efims-frontend/`) — full module coverage, one real page per backend module

Built: the full auth/session architecture (httpOnly-cookie session holding the backend's own JWTs
verbatim, optimistic route gating + silent token refresh via `proxy.ts`, Server Actions for every
write, zero authorization logic duplicated client-side — the backend is the sole authorization
authority on every real request), the dashboard shell with 20 role-scoped dashboards grouped under
Monitor/Manage/Govern, and a real page for every backend module (signals, incidents, cases — with a
7-tab detail view, audit, configuration, notifications, user management with the maker-checker
access-change inbox).

**Design system**: originally "Botanical Executive" (warm porcelain/spruce-green, Playfair Display
+ Plus Jakarta Sans). In the most recent session, blended with a second, previously-unused design
system found in the project's own mockup reference files ("EFIMS Vanguard Precision" — cooler,
forensic/analyst-feeling, Linear/Stripe/Palantir-inspired) into "Botanical Precision": Vanguard's
cooler slate surfaces, Botanical's spruce-green kept as the one warm accent, Playfair headlines
kept, severity tokens fixed to 4 genuinely distinct colors (previously S2 and S3 were the literal
same hex value — a real bug, not a style complaint). New structural additions that didn't exist
before this session: a global Ctrl+K command-palette search, the app's first real charts (recharts:
an outcome trend on Audit, a severity trend on the Executive dashboard), and a quick-preview
slide-over detail drawer on the Cases list.

**Known, currently-unaddressed gaps**:
- The density/mono (forensic-identifier monospace styling) roll-out only reached Audit, Cases, and
  the Executive dashboard as a representative pass — the remaining list pages and 16 other role
  dashboards inherit the new color tokens automatically (CSS variables) but not yet the literal
  density/radius/mono class changes.
- No generic capability/permission-string engine — `Role` stays a flat scalar enum, not a
  many-to-many Role/Permission model (a deliberately left, documented future seam).
- No access-recertification campaigns, no real invite-link flow for new users.
- Frontend has the same "no automated tests" gap as the backend.

### 6.3 Real bugs found and fixed along the way (a representative sample, not exhaustive)

This project has a consistent pattern of catching real defects through live verification rather
than static review alone. Recent, concrete examples:

- **Audit hash-chain integrity bug** (root-caused, not just patched): two call sites put a live JS
  `Date` object into audit `metadata` instead of a pre-serialized string; the shared
  `canonicalize()` hashing function had no case for `Date` (zero own enumerable properties), so it
  silently hashed as `{}` at write time — permanently disagreeing with the ISO string read back
  after the JSONB round-trip. Fixed in the one shared function all callers use. The 3 already-
  broken historical rows were deliberately left untouched (append-only ledger — see §3 item 3);
  `verifyChain` was also fixed to surface every break instead of stopping at the first one.
- **A real non-negotiable-#2 violation caught before shipping**: a new severity-trend chart's data
  query was first written directly inside `IncidentsService` against a table (`TriageAssessment`)
  it doesn't own. Caught by explicitly re-checking the new code against the project's own stated
  rules; moved to `TriageService` (which already legitimately owns that table) using a new
  cross-module `IncidentsService.getVisibleIncidentIds` read.
- **Groq model name went stale underneath the feature**: `GROQ_MODEL` was hardcoded to
  `llama-3.3-70b-versatile`, which Groq has since removed from its catalog — both new AI endpoints
  500'd until this was caught by querying Groq's own `/v1/models` list and switching to a model
  that's actually still servable (`openai/gpt-oss-120b`). This had gone undetected because the
  feature had only ever been tested against its own "unconfigured" fallback path, never against a
  real key, until this handover session.
- **A Server-Action/`revalidatePath` race left a UI control falsely stuck**: a "Relate this
  incident" button, invoked as a direct client-side call to a Server Action (not via `<form>`),
  could remain disabled forever even though the underlying write had already succeeded — the
  action's own `revalidatePath()` raced against a local React state update trying to reflect the
  same change, and the local update could silently lose. Fixed by re-fetching from the backend
  after the action settles instead of trusting local state — slower, but correct and self-healing
  regardless of the race.
- **Dev-server restart artifacts** (environment-specific, not application bugs, but worth flagging
  for whoever analyzes this next): restarting the Next.js dev server mid-session (required to pick
  up new environment variables, since `next dev`'s watch mode does not watch `.env` files) leaves
  any already-open browser tab holding a stale JS bundle. Symptoms observed and correctly diagnosed
  as this cause, not real bugs: a React hydration mismatch warning, and a "Server Action
  unavailable" error (Next.js's own stale-action-id signal) — both resolved by a hard refresh.

## 7. What a fresh analysis should probably focus on

Given the above, productive lines of independent inquiry likely include:
- Whether the single biggest leverage point really is automated test infrastructure (the project's
  own working assessment), given that every correctness claim to date rests on manual,
  uncommitted verification scripts.
- Whether the unratified CD-01–CD-08 register represents a go-live blocker in practice (i.e.,
  whether a real bank would accept "working defaults" for severity thresholds and approval
  authority in production), separate from whether the *code* correctly implements whatever values
  are eventually ratified.
- Whether the single-instance assumption baked into the in-memory cache/rate-limiter/cron jobs is
  adequately documented as a deployment constraint, or whether it's a silent landmine for whoever
  eventually scales this past one instance.
- Whether the `ml-gateway` module's "advisory only, human sets final severity" guardrail is
  actually enforced architecturally (it is, per §3 item 4 and the module's own read-only design) or
  could be weakened by a future change that doesn't go through the same review discipline this
  project has so far maintained.
- Whether the flat-scalar `Role` enum (now 20 values) is still the right call, or whether its
  documented "future seam" (a generic capability/permission model) should be pulled forward given
  how large the enum has already grown.
