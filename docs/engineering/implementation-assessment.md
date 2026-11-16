# EFIMS — Phase 0 Implementation Assessment

**Date:** 2026-11-14
**Scope:** A fresh, independent, code-level verification of the actual implementation state —
backend domain/module boundaries, the ML gateway against the newly-supplied Python service
contract, frontend architecture/completeness, and security/secrets/operational readiness. Four
parallel audits, each read-only, each required to cite file:line evidence rather than trust
existing documentation at face value.

**Relationship to existing tracking docs:** This project already runs an active
production-hardening pass with its own tracker (`docs/OPEN_ITEMS.md`) and decision log
(`docs/DECISIONS.md`). Most of this audit's findings **corroborate** what's already tracked there
— called out explicitly below, not re-litigated. This document's value is the **net-new findings**
a fresh, adversarial, code-first pass surfaced that weren't yet on that list, plus one real policy
conflict that needs a decision before any further AI-integration work proceeds.

---

## Decision resolved (2026-11-14) — Groq severity fallback is now opt-in only

**Originally flagged as a conflict between two authoritative sources; resolved the same day and
implemented, not left open.** Option 3 below was chosen: `MlGatewayService.suggestSeverity` now
requires an explicit `allowLlmFallback` flag — omitted, it returns a clean 503 (matching anomaly/
recovery's existing behavior) whenever the EFIMS AI Service is unreachable or risk-factor fields
are missing; set, it falls back to Groq exactly as before, still labeled "Groq (fallback)" in the
UI. The frontend's `SeveritySuggestionPanel` surfaces this as a second, explicit button ("Try an
LLM-estimated severity instead") shown only after the first request 503s — never automatic, never
silent. `CLAUDE.md` non-negotiable #4 updated accordingly. Verified live: an unavailable structured
call correctly 503s, the opt-in retry correctly succeeds via Groq with the advisory disclaimer and
source label intact.

The original conflict, for record:

- `CLAUDE.md` non-negotiable #4 (this project's own standing rule, in force since the ml-gateway
  was first built): *"Groq is kept only as (a) an automatic fallback for severity if the EFIMS AI
  Service is unreachable, and (b) the sole engine for duplicate/correlation detection."*
- The new master directive (section 6.10): *"Do not use Groq as an automatic fallback for failed
  predictive model requests. An LLM-generated severity label is not equivalent to a validated
  predictive classifier."*

The actual code (`ml-gateway.service.ts:186-211, 243-294`) implements CLAUDE.md's version: a
severity request that fails against the EFIMS AI Service (for any reason other than a 422
validation error) silently falls back to a Groq-generated severity label.

Both rules cannot hold at once. This is not mine to resolve — it's exactly the kind of
"irreversible architectural... decision" the directive itself says must be surfaced, not invented.
Three real options, not a recommendation:

1. Keep the existing fallback (CLAUDE.md's rule) — severity suggestions stay available even when
   the Python service is down, at the cost of occasionally being LLM-guessed rather than
   model-predicted (already labeled "Groq (fallback)" in the UI, so this isn't hidden from users).
2. Adopt the new rule — severity prediction becomes unavailable (clean 503, same as anomaly/
   recovery already behave) whenever the EFIMS AI Service is unreachable, with no Groq stand-in.
3. Something in between — e.g., keep the fallback but require a reviewer to explicitly opt into
   "LLM-estimated severity" per request rather than it happening silently.

Anomaly and recovery prediction already have **no** Groq fallback today (confirmed clean), and
duplicate/correlation detection is correctly Groq-only with no confusion about which provider
does what — so this conflict is scoped to severity prediction specifically.

---

## Net-new findings (not yet in `docs/OPEN_ITEMS.md`)

| # | Area | Existing State | Identified Gap | Risk | Evidence |
|---|---|---|---|---|---|
| 1 | Domain / module boundaries | `CasesService.stats()` aggregates recovery and approval data | Queries `tx.lossEntry.aggregate`, `tx.recoveryEntry.aggregate`, `tx.approvalRequest.count` directly instead of calling `RecoveryService`/`ApprovalService`'s own public methods, which already implement the identical aggregation | High | `cases/cases.service.ts:306-308` |
| 2 | Domain / module boundaries | `RecoveryService.listAll()` and `InvestigationsService` both need case title/reference for display | Each queries `tx.case.findMany(...)` directly instead of going through `CasesService` — same class of violation as #1, just smaller (a display-only join) | Medium | `recovery/recovery.service.ts:262`, `investigations/investigations.service.ts:251` |
| 3 | Domain / module boundaries | No shared cross-module read exists for "case id → summary" | The recurring pattern in #1/#2 exists because `CasesService` has no public `getCaseSummariesByIds()`-type method, so each consumer reinvents the direct query | Medium | Absence — confirmed `capa`, `regulatory`, `containment`, `evidence` are clean of this pattern |
| 4 | Audit integrity | `canonicalize()`'s 2026-09-30 `Date`-serialization bug is genuinely fixed | No equivalent branch exists for `Prisma.Decimal` (or any object with a custom `.toJSON()`) — the exact same bug class could recur the moment someone puts a raw `Decimal` into an audit `metadata` field. **Not currently triggered** (every `amount` field audited today is a plain `number`, confirmed at 3 call sites), but it's a live landmine | Medium | `audit/audit-hash.ts:56-58`; safe call sites confirmed at `recovery/recovery.service.ts:65,99,141` |
| 5 | Lifecycle transitions | `CasesService.updateStatus` requires an approved `ApprovalRequest` to transition **to** `CLOSED` | No equivalent guard exists for transitioning **out of** `CLOSED` (reopening) — asymmetric rigor: closing a case requires a human approval, reopening one requires nothing | High | `cases/cases.service.ts:406-413` |
| 6 | Case-access audit completeness | The single-record access check (`assertAccess`, used by `GET /cases/:id`) audits every denial with `AuditOutcome.DENIED` | The **batch/list** path (`isAccessible`, used by `list()`/`getVisibleCases()` to filter what shows up in a queue) computes the same denial reason but never calls `auditService.record` — a case silently filtered out of someone's list view is not audited at all. This is a real gap against CLAUDE.md's literal "any denial is itself written as an audit event" | Medium | `cases/cases.service.ts:680-700` (no audit call in the function) vs. `629-673` (does audit) |
| 7 | Case-access implementation duplication | The 7-condition rule is implemented twice — once for single-record access, once for batch filtering | Already self-documented in-code as a duplication risk (a future fix to one path silently not reaching the other) — flagging because #6 is a live example of exactly that drift already having happened | Medium | `cases/cases.service.ts:675-679` doc comment |
| 8 | ml-gateway / EFIMS AI Service contract | Severity request DTO field names match the documented contract exactly | Anomaly request sends `is_reversal`/`is_chargeback`; recovery sends `gross_actual_loss_ngn` — the user-supplied contract names these `reversal_flag`/`chargeback_flag` and `gross_actual_loss`. **Not confirmed as a real defect** — the auditing agent only had the directive's prose paraphrase of the contract, not the vendor's actual OpenAPI document, so this needs a byte-for-byte diff against the real spec before treating it as certain | High if confirmed, otherwise N/A | `ml-service-client.ts:66-82,100-101,114`; `ml-gateway.service.ts:213-227,308-309,340` |
| 9 | ml-gateway / EFIMS AI Service contract | `predictRecovery()` passes the Python service's `requires_human_review` straight through unchanged | The directive explicitly warns this field is unreliable (the vendor's own doc says it uses `recovery_probability` as a stand-in for confidence) and says EFIMS must apply its own independent review policy on top. No such independent policy exists today — same pass-through pattern exists for severity and anomaly too, though those two don't carry the vendor's own documented caveat | High | `ml-gateway.service.ts:361` (recovery), `:238` (severity), `:326` (anomaly) |
| 10 | ml-gateway service auth | No `EFIMS_AI_API_KEY` or equivalent exists anywhere (repo-wide grep: zero matches); `MlServiceClient.request()` sends only `Content-Type: application/json` | Not designed with an auth hook for when the vendor adds one — the directive asks for this to be anticipated, not just absent | Medium | `ml-service-client.ts:152-160` |
| 11 | ml-gateway base URL | `ML_SERVICE_BASE_URL` defaults to `http://127.0.0.1:8000` if unset | No startup guard preventing this default from silently running in a non-dev environment | Medium | `ml-gateway.service.ts:161` |
| 12 | Frontend loading states | Only **2** `loading.tsx` files exist in the entire frontend (`(app)/loading.tsx` root, `incidents/loading.tsx`) | Cases, evidence, recovery, regulatory, containment, approvals, investigations, signals, users, audit, configuration, CAPA/remediation — none have route-level loading UI. Given this project's own well-documented ~10-13s dev-DB latency, navigating into most of the app shows a blank screen until the whole Server Component resolves | High | `find src/app -iname "loading.tsx"` → 2 results against 17+ other data-backed routes |
| 13 | Frontend pagination | `cases/page.tsx` has real offset-based pagination | `recovery/page.tsx` (`getRecoveryRegister`) and `regulatory/page.tsx` (`getRegulatoryRegister`) fetch their entire register unbounded — no limit/offset/Prev-Next anywhere. Fine at current seed scale, a real scaling gap the moment either register grows | Medium | `recovery/page.tsx:15`, `regulatory/page.tsx:17` vs. `cases/page.tsx:148-153,308-322` |
| 14 | Frontend error states | One shared `(app)/error.tsx` catches every error below it | Same generic "something went wrong" treatment regardless of whether the underlying failure was a 403 (permission denied), a 400 (validation), or a 500 — no differentiated copy/visual per error class | Medium | `(app)/error.tsx:15-31` |
| 15 | Documentation drift (self-correcting) | `CLAUDE.md`'s 2026-11-02 entry states "no deployment pipeline — no Dockerfile/render.yaml/CI anywhere" | A real CI workflow (`.github/workflows/ci.yml`) now exists (lint/typecheck/build/dependency-audit-gate for both apps, plus a conditional backend e2e job) — `docs/OPEN_ITEMS.md` has already been partially updated to reflect this, but `CLAUDE.md`'s own older claim is now stale and should be corrected for accuracy, not left implying CI doesn't exist | Low (doc accuracy, not a real risk) | `.github/workflows/ci.yml:1-111` |

---

## Corroborated findings (already tracked in `docs/OPEN_ITEMS.md` — independently reconfirmed, not new)

Verified fresh against actual code/commands rather than re-stated from memory:

- **Zero backend unit tests, 6 real backend e2e specs** (auth, tenant-isolation, case-access-matrix,
  audit-integrity, containment-gate, ai-advisory-boundary) — confirmed genuine (not placeholder)
  by reading full file contents, not just filenames. Rough estimate: **~65-70% of backend modules
  have zero test coverage of any kind**, and even the covered ~30% is tested for one narrow
  cross-cutting concern each, not full business-logic coverage (e.g. recovery ledger math, CAPA
  validation rules, incident merge/link logic, the new bulk-assign/escalate methods — all
  untested).
- **Zero frontend automated tests** — no Jest/Vitest/Playwright/Testing-Library dependency, no
  test script, unchanged from the 2026-11-02 self-audit.
- **Backend: 17 production-path npm vulnerabilities (0 critical, 5 high, 12 moderate)**, all
  requiring the deliberately-deferred NestJS 10→12 major bump. **Frontend: 0 vulnerabilities.**
  Both counts reconfirmed by actually running `npm audit --omit=dev` just now, not assumed.
- **No `Dockerfile` or `render.yaml` anywhere** despite being described as deployed to Render — CI
  existing is not the same as a deployment pipeline; this gap is real and unchanged.
- **No backup/DR operationalization** beyond CD-07's target-number table — no runbook, no restore
  drill has ever run. For a financial-crime system this is flagged **Critical**, not just a
  process gap.
- RLS/tenant isolation: all 36 tenant-scoped Prisma models have a corresponding RLS policy; the
  only 3 `forCurrentTenant`-bypassing calls found are legitimate (`Tenant` itself isn't
  tenant-scoped); both `@Cron` jobs correctly loop and establish tenant context per-tenant
  (single-instance-only limitation is itself already self-documented).
- Audit table is append-only at the **database grant level** (`REVOKE UPDATE, DELETE` on
  `audit_events`), not merely app-code discipline.
- Login brute-force throttling, refresh-token rotation with replay/theft detection, httpOnly+secure
  session cookies, CORS locked to an explicit origin list, and global rate limiting are all
  genuinely implemented — confirmed by reading the actual guard/service code, not just the doc
  comment claiming it.
- No file upload exists anywhere in the evidence module (hash + external pointer only, exactly as
  documented) — so file-signature/MIME-validation gaps are correctly **not applicable yet**, rather
  than a missing control.
- No mock/fabricated data found anywhere in the frontend; authorization is genuinely
  backend-enforced (frontend role checks are UI-visibility-only, confirmed by a real historical
  incident already documented in-code: an `INCIDENT_REPORTER` could see a triage form client-side
  but got a real backend 403 attempting to submit it); AI-prediction UI is well-designed and
  correctly advisory-only (click-to-fetch, never auto-filled, disclaimer shown verbatim, confidence
  and `requiresHumanReview` surfaced, recovery shown as a probability, never a monetary amount).

---

## What this audit could not verify (would need a dedicated follow-up pass)

- The ml-gateway field-name mismatches (#8 above) — needs the vendor's actual OpenAPI document,
  not a paraphrase, before treating as confirmed.
- Whether the CI e2e job's required secrets (`TEST_DATABASE_URL`, `TEST_DIRECT_URL`) are actually
  configured on GitHub, i.e. whether the 6 e2e specs are really executing on every PR or silently
  skipped.
- A systematic sweep of every controller's `@Roles`/`@UseGuards` decorators (only `cases` was
  spot-checked for this).
- `TenantContextService`'s `AsyncLocalStorage` implementation itself, and how the interceptor
  populates it per-request (taken at face value from `prisma.service.ts`'s own description).
- Whether the two newest Prisma migrations (`20261110161528_tasks`,
  `20261111191838_incident_ai_risk_factors`) have full RLS-policy follow-through beyond a spot
  check confirming `tasks` is present in the policy array.
- Full page-by-page frontend audit (sampled ~10 of ~20 routes); responsive/mobile behavior;
  accessibility/keyboard navigation.
- Whether `npm audit fix --force`'s NestJS 10→12 bump has any blocking factors beyond what's
  already documented.
- Production/staging environment configuration on Render itself (only `.env.example` and local
  `.env` were in scope).

---

## Recommended sequencing

Per the directive's own phased approach, this document was Phase 0's deliverable. Since then:
the Groq-fallback decision above was resolved and implemented; the frontend's total visual
redesign, its responsive/accessibility pass, and this doc's own "Phase 1 candidates" item below
have all shipped (2026-11-14) — see `docs/CHANGELOG.md`'s dated entries for each. Findings #1-#3
(module-boundary violations), #5 (reopen-from-CLOSED guard), and #6 (`isAccessible`'s un-audited
batch denials) are all closed, plus the latent `Prisma.Decimal` hash landmine fixed alongside them
even though it wasn't numbered in this doc's original net-new list. Verifying this surfaced two
real, unrelated, pre-existing issues — a stale `efims_test` migration state and a flaky
`tenant-isolation` e2e fixture under current Neon conditions — both now tracked in
`docs/OPEN_ITEMS.md` rather than silently worked around.

Remaining, not yet started: everything else in `docs/OPEN_ITEMS.md`'s existing list stays exactly
as already prioritized there — this audit found no reason to reorder it.
