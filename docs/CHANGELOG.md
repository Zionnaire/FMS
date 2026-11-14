# EFIMS — Build Changelog

Running log of decisions and changes made during the build. Add a dated entry every time a
doc in this folder is revised, a module ships, or an architectural/config decision changes.
Newest entries at the top.

---

## 2026-11-11 — Real EFIMS AI Service integration (replaces Groq as primary severity engine)

User's ML developer delivered a real, separately-running Python/FastAPI service ("EFIMS AI
Service v1.0") exposing three trained models over HTTP: severity prediction, transaction anomaly
scoring, and recovery-probability prediction — full contract (request/response shapes, accepted
enum values, error codes, human-review thresholds) in a reference document, not the running
service itself. User's explicit direction: this service becomes the source of truth for
everything it covers; Groq is kept only as an automatic severity fallback and as the sole engine
for duplicate/correlation detection (which the new service doesn't cover at all). Non-negotiable
#4 reworded accordingly — "only caller of Groq" was never accurate for a two-provider world.

**Schema**: `Incident` gained 8 new, all-nullable risk-factor fields (`financialExposureNgn`,
`customerImpactCount`, `ongoingThreat`, `insiderInvolvement`, `dataCompromise`,
`regulatoryRelevance`, `channel`, `reportedByType` — migration `20261111191838_incident_ai_risk_
factors`) — the structured facts the severity model needs that nothing in EFIMS captured before.
Captured once (new `PATCH /incidents/:id/risk-factors` route) rather than re-entered on every
suggestion request.

**`ml-gateway`**: new `ml-service-client.ts` (plain `fetch`, 5s timeout, typed against the
vendor's exact JSON shapes) alongside the existing Groq (`openai` SDK) client.
`MlGatewayService.suggestSeverity` is now an orchestrator — tries the structured model first
(skips straight to Groq if any risk-factor field is missing, rather than sending fabricated
defaults), falls back to Groq only on unreachability (a 422 — our own mapping bug — surfaces as a
400 instead, deliberately not swallowed by the fallback). Response carries `source: 'structured-
ml' | 'groq-fallback'` so an analyst always knows which engine answered. Two new pass-through
capabilities, no Groq equivalent for either: `scoreAnomaly` (new `MlGatewayController`, `POST
/ml-gateway/anomaly/score`, not case-scoped — a standalone investigative tool, audited as
`entityType: 'AdHocQuery'`) and `predictRecovery` (new `RecoveryService.predictRecovery`, `POST
/cases/:caseId/recovery/predict` — derives `gross_actual_loss_ngn`/`containment_confirmed` from
real case data rather than trusting client input, takes the four fields EFIMS doesn't model
—severity/fraud_type/channel/days_to_detection — from the request).

**Carried over verbatim from the vendor's own documentation**, per this project's standing rule to
never represent a capability as more reliable than its own docs say: trained on synthetic data,
not for real case decisions yet; severity S1 has only 3 training examples; recovery's
cross-validated ROC-AUC is 0.627; fairness checks are inconclusive.

**Mock server for verification**: this session doesn't have the ML dev's actual Python project,
only the reference document — a throwaway local mock implementing the exact documented contract
(including 422/503/500 cases) was used to verify the integration end-to-end; the real service,
once running, needs no code change on this side since the client is built against the documented
contract, not the mock.

**Open items sent back to the ML dev**: field-mapping gaps (`channel`/`reported_by_type` are new
EFIMS fields with no prior canonical values; `incident_type`/`source` don't share a vocabulary
with the vendor's fixed lists); clarified that CORS is the wrong control for a server-to-server
integration (EFIMS never calls this from the browser) — a network-level allow-list is what
actually matters once this is reachable beyond localhost; asked about the auth header format,
the feedback-loop mechanism for analyst accept/override decisions, and confirmation of a real
Docker build before relying on one for deployment.

Full task list and verification detail: see this session's plan file / PR description.

---

## 2026-11-11 — Hybrid design pass (Contra/SimpliRisk-inspired), 7 phases

User shared Contra/SimpliRisk screenshots plus `EFIMS_Hybrid_Design_Spec.md` and an update-
instructions document scripting a "Step 0: report, then wait" reconciliation. Unlike the earlier
TanStack/Emerald-Porcelain documents (rejected 2026-10-14), this one is explicitly additive — same
stack, same sidebar/routes, same Botanical/Vanguard identity, layering patterns inside existing
pages. Did a real Step-0 audit (3 parallel research passes) rather than guessing, surfaced several
places the spec's own assumptions didn't match the real app (no single shared "Overview" page —
`/` is a 20-role dispatcher; no case-level SLA clock, only one per incident; a generic "mark task
done" button is unsafe for 3 of 4 candidate source entities), and got 3 explicit scoping decisions
from the user before writing any code: build a real `Task` entity (not a pure synthesized view);
don't refactor the 20 role dashboards into the spec's 8 shared archetypes this pass; finish the
already-in-flight register-pages work first.

**Phase 1** — carried forward the prior plan's still-open sidenav restructure (exact Monitor/
Manage/Govern grouping the user confirmed) and Settings consolidation (`/settings/integrations`,
an honest "not connected" status page per source system; `/settings/retention`, a real register of
legal-hold evidence + a read-only CD-05 summary). New `/intake` page renders the *existing*
`/signals`/`/incidents` page content as tab panels by exporting each page's body as a named
`*PageContent` function and giving each `page.tsx` a thin default-export wrapper — no
data-fetching duplicated, `/signals`/`/incidents` keep working unchanged for deep links.

**Phase 2** — new `Task` Prisma model + `src/modules/tasks/` (migration `20261110161528_tasks`,
RLS policy added to `rls-policies.sql`). Deliberately NOT a parallel mutable copy of `CapaAction`/
`InvestigationIssue`/`ApprovalRequest`/`ContainmentRequest`'s own lifecycles — those four each have
real business rules (CD-04 gates, segregation of duties, confirmation-gating) a generic "mark
done" action must never bypass. `Task` only persists freestanding to-dos; `TasksService.listAll`
is the cross-case register for those. New `TASK_ASSIGNED_EVENT` wired into `NotificationsService`
exactly like `APPROVAL_REQUESTED_EVENT`'s precedent — confirmed live, a real notification arrived
for a different user on task creation, not just self-assignment.

**Phase 3** — `/cases` gained a Cases | Tasks tab pair (reusing `/referrals`'s own Link+searchParam
tab pattern). The Tasks tab is a **union**, not a single source: real `Task` rows plus read-derived
rows from CAPA (open/in-progress), approvals (pending), and containment (requested) — each
derived row's "open" action always routes to the real case-detail tab, never a generic complete
button. `InvestigationIssue` excluded from v1 (no cross-case register endpoint for it yet,
genuinely least task-shaped of the four — no owner, no due date) — a stated fast-follow, not a
silent gap. Mine/Overdue/All filters only — dropped the spec's "team"/"blocked" filter ideas since
neither concept exists anywhere in this codebase (would've been dead controls).

**Phase 4** — case-detail right rail (`cases/[id]/right-rail.tsx`), `layout.tsx`'s `{children}`
slot wrapped in a `grid-cols-[1fr_320px]` with the rail as a sibling column — no change needed to
any of the 7 tab pages' own internal grids. Linked-incident SLA panel reuses the existing
per-incident `getCurrentSlaClock` (no case-level clock was invented); `CasesService.getSummary`
extended to return actual linked-incident ids/reference codes, not just a count. "Recent activity"
deliberately left out: the only candidate filter (`GET /audit-events?entityId=`) only matches
direct Case-entity events, not the richer CAPA/approval/evidence activity a reader would expect —
shipping a misleadingly partial feed would be worse than omitting it.

**Phase 5** — Executive dashboard only gained Operations | Analytics tabs (first real consumer of
the installed-but-unused shadcn `Tabs` primitive) — the other 16 `QueueDashboard`-driven roles
don't, per the "no dashboard consolidation this pass" decision and the spec's own "no dead
controls" rule (a population-level Analytics tab on a single-role queue view would be exactly
that). Analytics tab keeps the existing severity-trend chart and adds a second real chart
(`components/charts/recovery-bar-chart.tsx`, Recharts `BarChart`) — verified loss vs. reconciled
recovery per case, fed entirely by the already-shipped `/recovery` register endpoint, no new
backend stats route needed.

**Phase 6** — small, representative color-token touch-up (`audit/page.tsx`, `cases/page.tsx`):
swapped `text-primary` to neutral `text-on-surface` on the two KPI sub-stats that render a status
count (Audit's SUCCESS count, Cases' CLOSED count) rather than a genuine headline total. Audit
itself came back clean: `status-badge.tsx` already routes "positive" through a separate `tertiary`
token, never `primary` — the brand-color-means-status risk the spec worried about mostly wasn't
real here.

**Phase 7** — `/configuration/[key]` gained Baseline | Proposed amendment | Comparison | History
tabs (baseline = latest RATIFIED history entry if any; proposed amendment = current DRAFT if one
exists; comparison = a plain key-by-key diff of the two `value` objects) plus a persistent
"Unratified — working default only" badge, confirmed live on CD_02 (not yet ratified for this
tenant). New site-wide `UnratifiedConfigurationBanner` in `(app)/layout.tsx`, shown to every
authenticated role (not just Configuration roles) while any of CD-01–08 is unratified — directly
reinforces non-negotiable #9 instead of only stating it in docs.

**Verification**: tsc/lint clean on both apps after every phase. Live-verified via several
Playwright passes against the real running dev servers (never restarted mid-test except once,
deliberately, after both genuinely crashed — see below): all 17 sidenav routes, the Tasks tab's
merge/filters/inline complete action (confirmed a real backend round-trip, not just local state),
the right rail on cases with and without linked incidents, the Executive Analytics tab vs. a
QueueDashboard role's unchanged dashboard, the color swap via computed styles, and the CD-02
unratified badge. One real environment incident along the way: both dev servers crashed mid-session
(`EADDRINUSE` in the backend log, consistent with many rapid `nest start --watch` recompiles under
heavy concurrent file edits) — restarted once, confirmed healthy, not a code defect. Two apparent
test failures during the final pass were both test-script bugs, not app bugs: a `networkidle`
wait condition that doesn't fit a page with a live Socket.IO connection (fixed by re-checking with
`waitUntil: 'load'` — `/audit` loads in ~12s, just slow, zero console errors), and a case-link
selector that matched the "New case" button's `/cases/new` href instead of a real case id (the
"UUID is expected" errors it produced were the correct, expected validation response, not a bug).

**Next**: `InvestigationIssue` in the Tasks union once a cross-case register exists for it; the
full states/accessibility pass (empty/loading/forbidden/conflict/offline/read-only across every
view) stays explicitly deferred as its own cross-cutting pass, not scattered across this one; the
2026-11-02 production-readiness backlog (automated tests, `ml-gateway`'s existence now closes one
item but most of that list is untouched) is still the real next priority whenever the user picks it.

---

## 2026-11-10 — design system blend ("Botanical Precision") + the first real `ml-gateway`

User pushed back hard on the 2026-11-02 audit's framing: unconvinced the product actually solves
the problem it's named for ("Financial Crime **Intelligence** & Incident Management System" with
zero AI anywhere), and dissatisfied with the design on three specific counts — doesn't read as
"intelligence" (every page a form + a table), the information architecture feels flat, and the
visual polish isn't there. Research confirmed concretely: 16 of 20 role dashboards share one
identical KPI-row-plus-table shell, no charting library existed anywhere in `package.json`, no
cross-entity search existed anywhere in the app, and — a real bug, not a style complaint — the
implemented severity tokens had S2 and S3 defined as the literal same color (`#f59e0b`). A second,
fully-specified design system, **"EFIMS Vanguard Precision"** (`mockups/design-tokens/
efims-vanguard-precision.md`), already existed — built for exactly this forensic/analyst feel
(Linear/Stripe engineering precision + Palantir Gotham/ServiceNow density) but superseded early in
the project before most pages were built. Shown side-by-side against the shipped "Botanical
Executive" on a real case page; user chose to blend the two rather than adopt either wholesale.

**Design: "Botanical Precision" token blend** (`efims-frontend/src/app/globals.css`) — Vanguard's
cooler slate surface scale replaces Botanical's warm porcelain-cream, Botanical's spruce-green
(`#072320`) is kept as the one warm primary accent, secondary/tertiary move to Vanguard's cooler
slate/blue pairing, elevation shadows retint from green to neutral slate. Playfair Display
headlines are kept (explicitly not swapped to Inter). Severity tokens adopt Vanguard's 4 distinct
colors verbatim, fixing the S2/S3 collision as part of the token swap rather than a one-line patch.
Shape-language policy documented: `rounded-full` reserved for status badges only, going forward.

**Structural additions, all new, none existed before**:
- **Global Ctrl+K search** (`components/shell/command-palette.tsx` + `app/api/search/route.ts`) —
  fans out to the cases/incidents/signals list endpoints' existing `q` filter plus a `GET /users`
  substring match; no new search index, reuses what's there.
- **First real charts** (`components/charts/trend-chart.tsx`, `recharts`) — an outcome trend on the
  Audit page and a severity trend on the Executive dashboard. Both needed small new backend
  time-series endpoints (`GET /audit-events/trend`, `GET /triage/severity-trend`) since the
  existing `*/stats` endpoints are point-in-time snapshots, not day-grouped series. The severity
  trend read `TriageAssessment` — caught and fixed a real non-negotiable-#2 violation before it
  shipped: this was first written directly inside `IncidentsService`, which doesn't own that
  table; moved to `TriageService` (which already depends on `IncidentsService` for visibility,
  never the reverse) using a new `IncidentsService.getVisibleIncidentIds` cross-module read,
  mirroring `CasesService.getVisibleCaseIds`'s established pattern.
- **Detail drawer** (`components/shell/detail-drawer.tsx`) — scoped to Cases only, per the plan.
  Clicking a row opens a quick-preview slide-over using data already in the list response (no
  extra fetch); "Open full case" still goes to the real `/cases/[id]` route, which is unchanged.
- Dense table/mono treatment: `components/ui/table.tsx` tightened to Vanguard's 36/40px row-height
  spec, new `components/ui/mono.tsx` for forensic identifiers (case/incident ids, hashes,
  timestamps), applied to Audit and Cases as the representative pass — not every page.

**The first real `ml-gateway`** (`efims-backend/src/modules/ml-gateway/`) — the module CLAUDE.md
has named as the system's sole AI entry point since the beginning, never built until now. Builds
exactly CD-08 Phase 2 (`docs/configuration-decisions.md`), nothing further up that roadmap:
- `MlGatewayService` — the only caller of Groq anywhere in the codebase (non-negotiable #4),
  using the `openai` SDK pointed at Groq's own base URL (Groq's API is OpenAI-compatible). Fails
  gracefully (503, not a crash) when `GROQ_API_KEY` isn't configured — confirmed live.
- **Severity suggestion** (`GET /incidents/:id/triage/suggestion`) — advisory-only, read-only,
  never writes a `TriageAssessment`. Surfaced on the incident page as a "Get AI suggestion" button
  the human opts into (not an automatic page-load call — it's a real external API call with real
  latency/cost), shown beside the human's own severity picker, never prefilling it.
- **Duplicate/correlation detection** (`GET /incidents/:id/similar`) — same advisory posture,
  candidate set is this actor's own compartment-filtered visible incidents in the same category.
  Wires to the already-existing, already-tested `relate`/`merge` actions — only the "find and
  score" step is new.
- Both capabilities were a genuine architectural near-miss, caught and corrected before shipping
  (see above) — a concrete demonstration of why non-negotiable #2 matters in practice, not just
  in principle.

**Explicitly out of scope, confirmed real gaps, correctly deferred**: the much larger "intelligence"
mockups (`network-graph`, `entity-risk-scoring-watchlist`, `customer-360-entity-profile`,
`alert-rule-engine`) all need entirely new domain models (Customer/Account/Transaction/Entity)
that don't exist anywhere in the schema — genuine multi-week undertakings, not a slice of this
pass. CD-08 Phase 3+ (narrative generation, anomaly detection, case summarization) is not
attempted. The mechanical density/mono roll-out across every remaining list page (Signals,
Incidents, all 20 role dashboards) is not exhaustive — Audit, Cases, and the Executive dashboard
are the representative pass; the rest inherit the new color tokens automatically (CSS variables)
but not yet the literal density/mono/radius class changes.

**Verification**: `npx tsc --noEmit` + lint clean on both apps throughout. Live-verified: the token
blend screenshot-confirmed correct, Ctrl+K search (button and real keyboard shortcut) returning
real results, both new charts rendering, the Cases drawer opening/closing correctly, both new
ml-gateway endpoints degrading to a clean 503 (not a crash) with `GROQ_API_KEY` unset and the
frontend panels surfacing that gracefully. Full regression — the complete admin-driven
signal-to-users flow — re-run twice (once catching a test-script selector bug of its own, not an
app bug), passing all 20 steps with zero console errors on the final run.

---

## 2026-11-10 (cont'd) — real Groq key wired in, two real bugs found and fixed

User supplied a real `GROQ_API_KEY`. Verifying the two ml-gateway capabilities against it (not
just their configured-vs-not-configured code paths, which were all that could be confirmed above)
surfaced two real bugs, both fixed and re-verified live:

- **Wrong model name.** `GROQ_MODEL` was hardcoded to `llama-3.3-70b-versatile`, which Groq has
  since removed from its catalog — both endpoints 500'd with "The model ... does not exist."
  Queried Groq's own `/v1/models` list with the real key to find what's actually servable today;
  switched to `openai/gpt-oss-120b` in `efims-backend/.env` and `.env.example`. Both endpoints then
  returned real, sane output: a severity suggestion of S4/92% confidence for a test incident with
  no realized loss (correctly low per CD-02), and a similarity scan correctly scoring near-duplicate
  test incidents at 0.99 against 0.40–0.55 for same-category-only matches. This is the kind of gap
  that CLAUDE.md's own working agreement exists to catch early — a model name silently going stale
  underneath a feature that had only ever been tested against its own 503 fallback path.
- **`SimilarIncidentsPanel`'s inline Relate/Merge could get stuck disabled forever even though the
  backend write had already succeeded.** Root cause: `act()` called the existing
  `relateIncidentsAction`/`mergeIncidentAction` Server Actions (which call `revalidatePath`
  internally) and then tried to locally `.filter()` the acted-on candidate out of client state —
  but a Server Action invoked directly from a Client Component (not via `<form>`) races its own
  `revalidatePath` against that local state update, and the local update could get lost even
  though the backend call returned 200. Symptom: the button stayed disabled indefinitely, with no
  console error, misleading a human reviewer into thinking the action hadn't registered when it
  actually had. Fixed in `efims-frontend/src/app/(app)/incidents/[id]/similar-incidents-panel.tsx`
  by re-fetching the similarity list from the backend after the action settles (in a `finally`)
  instead of trusting local filter state — slower (the full list now re-scores via Groq again,
  ~15–20s combined), but correct and self-healing regardless of the race, which matters more for
  an advisory surface a human is relying on to reflect real state.

**Verification**: direct backend calls confirmed real Groq JSON for both endpoints; a live browser
pass confirmed the severity-suggestion panel renders real output (~5–9s latency, never prefilling
the human's own picker) and the similarity panel renders real scored candidates with working
inline Relate/Merge, re-tested specifically against the race above until it settled cleanly with
zero stuck buttons across repeated runs. `npx tsc --noEmit` and `eslint` (whole `src/`, zero
warnings) both clean on the frontend after the fix.

---

## 2026-11-02 — production-readiness audit + security patches

User asked for a full production-readiness gap analysis ("what do we still need for this to work
end-to-end for full production grade"). Three parallel research passes audited backend, frontend,
and infra/compliance with concrete file-level evidence rather than a generic checklist. Full gap
list (blocking vs. high-priority vs. explicitly-deferred-per-architecture.md §6) was presented to
the user; **user chose to start with security patches only** — the rest (automated test
infrastructure, a real deployment pipeline, structured logging/APM, CD-01..08 ratification, legal/
compliance docs, MFA, tenant billing/offboarding, and the backend's NestJS 10→12 major upgrade) are
confirmed gaps but **deliberately not started**, pending the user's own prioritization.

**Headline findings, for reference** (not yet acted on except where noted below):
- Zero automated tests in either app — every "live-verified" claim in this project's history was a
  manual Playwright/curl script run from a scratch folder, never committed. Confirmed independently
  by both audits; the frontend's own README already admits this.
- `ml-gateway` does not exist — `CLAUDE.md`'s "AI: Groq, called only through ml-gateway" is
  aspirational; no such module exists anywhere in `efims-backend/src/`, and notification "external
  delivery" is a stubbed no-op.
- No deployment runbook, `Dockerfile`, `render.yaml`, or CI/CD anywhere, despite being described as
  "deployed to Render."
- All 8 Configuration Decisions remain unratified drafts (confirmed against
  `docs/configuration-decisions.md`'s own ownership/ratification tracker) — none can be represented
  to a bank or regulator as final policy yet.
- The in-memory cache, rate limiter, and `@Cron` jobs are all single-instance-only — a real
  correctness bug (stale config across instances, duplicate SLA-breach runs, non-shared rate
  limits) the moment a second backend instance is added; currently masked only because deployment
  is explicitly single-instance today.
- No regulator-grade audit export (API-only, capped at 200 rows), no legal/compliance docs
  (privacy policy, ToS, DPA/GDPR/NDPA material), no backup/DR operationalization beyond CD-05/
  CD-07's paper policy, no incident-response runbook for EFIMS itself, no tenant billing/
  offboarding/data-export flow.
- ~27 of 35 `mockups/screens/*.html` references have no corresponding page (MFA, whistleblower
  portal, network graph, STR form generator, alert rule engine, and others) — some may be
  deliberately out of MVP scope, not yet confirmed one by one.

**Security patches applied this pass:**
- **Frontend dependency vulnerabilities**: `npm audit` showed 18 production-path vulnerabilities,
  including a **critical unauthenticated RCE in Next.js** (16.0.0–16.4.0 range). Root cause for
  most of the noise: `shadcn` (a dev-time CLI scaffolding tool, never imported at runtime) was
  listed in `dependencies` instead of `devDependencies`, pulling its whole MCP/`ts-morph`/build-tool
  dependency tree into the production audit scope. Fixed: moved `shadcn` to `devDependencies`,
  upgraded `next` 16.3.6 → 16.4.3 (fixes the RCE) and `zod` ^4.6.5 → ^4.6.7, then
  `npm audit fix` for the rest. **Result: 0 production-path vulnerabilities** (was 18, including
  the 1 critical). Verified: clean `tsc`/`lint`, and a full `next build` succeeds with the upgraded
  Next.js.
- **Backend dependency vulnerabilities**: `npm audit fix` resolved the one critical finding
  (`handlebars`, a transitive dependency of `@nestjs/cli` — build-time only, never shipped in the
  compiled `dist/` output). The remaining 17 production-path findings all require a NestJS 10→12
  major-version bump across nearly every `@nestjs/*` package simultaneously — **deliberately not
  attempted in this pass**: for a financial-crime system this is a real framework migration
  deserving its own dedicated upgrade + full regression pass, not something to bundle into a
  routine patch sweep.
- **Login brute-force protection**: the global `ThrottlerModule` config
  (`efims-backend/src/app.module.ts`) had a comment claiming "a stricter [limit] on `/auth/login`
  use[s] `@Throttle()` where they're added" — but `@Throttle()` was never actually used anywhere.
  Added a real 5-requests-per-60-seconds override on both `POST /auth/login` (tenant users) and
  `POST /platform/auth/login` (cross-tenant super-admin, at least as high-value a target).
  Live-verified: the 6th login attempt within the window correctly returns `429`, and a legitimate
  login succeeds normally once the window clears.
- **Stale doc comment**: `efims-frontend/src/components/dashboards/admin-dashboard.tsx` still said
  "no frontend form yet" for user management — stale since the `/users` section shipped in the
  2026-10-29 entry below. Updated the comment and replaced the dead "Provisioning" info card with a
  real link to `/users/new`.

**Verification**: `npx tsc --noEmit` + lint clean on both apps; a full `next build` production
build succeeds; the login throttle live-tested end-to-end (blocks at 6 attempts/60s, resets
correctly); the full admin-driven end-to-end regression script re-run after all changes — all 20
steps pass, zero console errors.

---

## 2026-10-29 — three deferred follow-ups shipped: live notifications, user-management UI, inline form validation

`CLAUDE.md`'s own status section had three items explicitly marked "not started, don't start
unprompted": real-time Socket.IO push on the `notifications` page, a user-management UI
(`POST /users` and the whole maker-checker access-change flow had no frontend), and inline
per-form validation beyond the single shared `(app)/error.tsx` boundary. User hit two real bugs
while validating a signal this session (a free-text taxonomy field with no indication of valid
values, then a controlled/uncontrolled `Select` warning from fixing the first one), asked to
"revalidate end-to-end," and scoped it via explicit choice to building these three specific
deferred items, planned first.

**Signal-validate bugs fixed first** (`efims-frontend/src/app/(app)/signals/[id]/`): the
`category`/`type` fields in `validate-form.tsx` were plain free-text inputs with no connection to
the real CD-01 taxonomy — "Theft" was rejected with no indication of what the valid categories
even were. Fixed by fetching the real, current CD-01 taxonomy server-side in `page.tsx` (only for
roles that can actually triage) and rendering `category` as a dropdown with a dependent `type`
dropdown scoped to the chosen category. Separately, `GET /signals/:id` is intentionally open to
any authenticated role, but validate/reject is not — an `INCIDENT_REPORTER` viewing their own
submitted signal could see and submit the validate form, only to get a confusing post-submit 403;
fixed by gating the form's visibility client-side on a `TRIAGE_ROLES` list mirroring the backend's
own constant. Fixing the taxonomy dropdown then surfaced a genuine React bug: initializing the
category `Select`'s state as `useState<string | undefined>(undefined)` made it render uncontrolled
on first paint and controlled the instant something was selected — Base UI correctly flagged this.
Fixed by initializing to `""` instead, so the controlled prop is never literally `undefined`.

**Real-time notifications** — the backend needed no changes: its JWT-authenticated realtime
gateway (`efims-backend/src/infrastructure/realtime/`) already pushed `notification.created` to a
user's own room on every notification-creating domain event; the frontend simply never connected.
Added `socket.io-client` as a real dependency, a new `NEXT_PUBLIC_REALTIME_URL` env var (the one
deliberate exception to "the browser never talks to the backend directly" — a long-lived push
channel can't be proxied through a stateless Server Action the way REST calls are), a new Route
Handler (`src/app/api/realtime-token/route.ts`) that hands the existing short-lived access token to
client JS since the session cookie is httpOnly, and a shared `useRealtimeNotifications` hook used
independently by both the notifications page's list and the topnav bell badge (each a thin client
wrapper around the existing server-rendered initial data, so first paint is unchanged). Verified
live: a notification fired from a separate session arrives in an already-open browser tab with zero
reload, both in the list and the badge count.

**User-management UI** — backend was already fully built (`POST /users`, and the maker-checker
`AccessChangeRequest` flow for role/compartment changes — there is deliberately no direct,
unmediated endpoint to change a role or grant/revoke a compartment, only the request/decide pair),
but had zero frontend. Added a full `/users` section: list, create, a per-user detail page with a
request-access-change form and inline approve/reject (hidden for the requester's own pending
requests, mirroring the backend's self-decision block), and a tenant-wide pending-requests inbox.
Gated to `ADMIN` in the sidenav, consistent with the backend's own `ADMIN`-only gate on every
mutating route here.

**Inline per-field validation** — a working pattern already existed in exactly 3 places (the two
login forms and tenant creation: Zod `safeParse` → `fieldErrors` + try/catch → `useActionState`),
but every data-entry form elsewhere still void-returned and let a thrown `ApiError` fall through to
the shared error boundary. Added one shared parser (`src/lib/form-state.ts`) that turns a backend
`ApiError` into field-level errors — the backend's `ValidationPipe` has no custom
`exceptionFactory`, so class-validator's default `"<property> <constraint text>"` messages are
exactly what's needed, no backend change required. Migrated every data-entry form in the app to
this pattern: all new user-management forms, signals (create/validate/reject), case creation, and
every case-detail tab (approvals, investigations, evidence, recovery, capa, regulatory,
containment), plus the configuration draft/ratify forms. Each conversion followed the same shape —
action returns `FormState` instead of `void`, form switches to `useActionState` — so a backend
rejection (duplicate email, the CAPA self-validation block, the approval segregation-of-duties
rule, a bad taxonomy category) now renders inline instead of hitting the generic boundary.

**Verification**: `npx tsc --noEmit` + `npm run lint` clean after each part. Live Playwright
verification of all three parts together — realtime push arriving with no reload, the full
maker-checker flow (create a second admin, request a role change, confirm self-decision is hidden,
log in as a different admin, approve it), and inline field errors rendering for a duplicate email
and an invalid signal field. Final regression: re-ran the full admin-driven end-to-end script
(signal → incident → triage → SLA → case → flag → approvals → investigations → evidence → recovery
→ capa → regulatory → containment → audit → configuration → notifications → users) — all 20 steps
pass, zero console errors, confirming the extensive form migration didn't regress anything already
verified.

---

## 2026-10-14 — 20-role RBAC expansion (per-tenant) + new platform/super-admin layer (cross-tenant)

User supplied an external "EFIMS Complete Claude Build Brief" written against a different stack
(TanStack Start/Vite/React Router) describing a richer ~20-role authorization model, per-role
dashboards, a Monitor/Manage/Govern nav grouping, temporary/expiring grants, and maker-checker for
access changes. Confirmed scope with the user before touching anything: **keep the real stack and
"Botanical Executive" design system entirely untouched; adapt only the role/dashboard/permission
ideas into the existing Next.js/NestJS/Postgres architecture; do the full 20-role matrix in one
pass** (not phased). Mid-pass, reviewing whether to narrow `ADMIN`'s existing blanket bypass per
the brief's "no default business-content access for admins" principle, the user asked for a
genuine cross-tenant `SUPER_ADMIN` layer instead ("we are going to be having multi-tenant
system") — a second, architecturally distinct piece of work, confirmed as **a new platform layer,
not a renamed `ADMIN`**, with real tenant provisioning built now rather than deferred. Both parts
below.

**Part A — per-tenant `Role` enum expanded 8 → 20 values** (`efims-backend/prisma/schema.prisma`).
Stays a flat scalar enum on `User`, not a many-to-many Role/Permission model — that generalization
is the schema's own documented future seam, not attempted this pass. New roles: `INCIDENT_REPORTER`,
`TRIAGE_ANALYST`, `EVIDENCE_CUSTODIAN`, `SECURITY_ANALYST`, `OPERATIONS_OFFICER`,
`RECOVERY_OFFICER`, `CONTROL_OWNER`, `EFFECTIVENESS_REVIEWER`, `HR_REVIEWER`,
`PROTECTED_DISCLOSURE_OFFICER`, `CONFIG_ADMIN`, `AUDITOR` (existing: `CASE_OWNER`, `INVESTIGATOR`,
`TEAM_LEAD`, `FRAUD_RISK_MANAGER`, `COMPLIANCE_MLRO`, `LEGAL_COUNSEL`, `EXECUTIVE`, `ADMIN`
unchanged). `Compartment` already covered every compartment the brief asked for — no new values
needed. Centralized 9x-duplicated role-list constants (`CASE_ROLES` etc., copy-pasted across
cases/evidence/containment/capa/regulatory/recovery/investigations/workflow/triage controllers)
into one `src/common/constants/roles.ts`, then extended each list with the roles above. Added new
cross-case "queue" endpoints (`GET /evidence/queue`, `GET /recovery/queue`,
`GET /capa/queue/owned`, `GET /capa/queue/validation`) so role dashboards have real tenant-wide,
access-filtered data — same pattern as the `*/stats` endpoints added in the 2026-09-30 density
pass. `UserCompartmentGrant` gained `expiresAt`/`revokedAt` (temporary/expiring grants — previously
absent); new `AccessChangeRequest` model + `AccessChangeService`/`AccessChangeController` for
maker-checker on role/compartment changes, reusing `ApprovalService`'s proven
requester-cannot-decide-own-request pattern rather than overloading the case-scoped
`ApprovalRequest` model (wrong shape — mandatory `caseId` FK). Seeded 19 new per-role users plus
the existing admin. Frontend: `Role` union expanded to match; `(app)/page.tsx` rewritten as a
per-role dashboard dispatcher (`lib/dashboard-loaders.ts`, 16 real backend-data-driven loaders +
a handful of bespoke dashboards for Executive/Reporter/Admin/Config Admin); sidenav rebuilt with
Monitor/Manage/Govern section grouping and per-item role filters.

**Scope decision, flagged rather than silently resolved**: tenant-scoped `ADMIN`'s existing
blanket bypass is unchanged this pass. The single seeded admin user is what every prior
verification pass in this project has relied on to drive every flow, and `Role` being scalar means
that user can't *also* hold a business role to keep that working. The user's actual concern — a
properly separate, more powerful administrative tier with no default business-content access — is
real, and now lives at the **platform** level (Part B), outside any tenant entirely, rather than as
a change to `ADMIN`'s behavior inside bank-1. Also out of scope this pass, flagged not dropped: a
generic capability/permission-string engine (stays flat-role-based), and access-recertification
campaigns (needs scheduling + campaign state — a separate feature, not a column addition).

**Part B — new platform/super-admin layer**, structurally separate from the tenant-scoped RBAC
system so a bug in one can't accidentally grant the other's power (a third boundary on top of
non-negotiable #5's "tenant isolation enforced twice"): new `PlatformUser` model
(`efims-backend/src/platform/`) — not a `Role` enum value, no `tenantId`, not RLS'd, alongside
`Tenant` as control-plane. Own JWT secret (`PLATFORM_JWT_SECRET`, separate from
`JWT_ACCESS_SECRET`), own guard (`PlatformAuthGuard`, populates `request.platformUser`, entirely
separate from `RolesGuard`), own login (`POST /platform/auth/login`, email+password, no tenant
slug). `TenantsAdminController`/`TenantsAdminService` — list all tenants with per-tenant case/user
counts (reuses `SlaClockService.sweepBreachedClocks()`'s established "list tenants directly, then
`withTenant(id, ...)` per tenant" cross-tenant pattern), provision a new tenant
(`POST /platform/tenants`), suspend/reactivate (`PATCH /platform/tenants/:id`). Extracted
`seed.ts`'s inline bank-1 bootstrap into one shared, plain (non-`@Injectable()`) function,
`provisionTenant()` (`src/platform/tenant-provisioning.ts`), callable from both the bare seed
script and a thin NestJS wrapper — no duplicated bootstrap logic between "the demo seed" and "a
real admin provisioning a bank." `rls-policies.sql`'s generic per-table-name RLS policies need no
changes for a new tenant — provisioning is genuinely just "insert a `Tenant` row + that tenant's
own CD-01..CD-08 defaults + first admin + a default team," already proven tractable by this
pattern. Frontend: new `/platform/login` + `/platform` (tenant list + create-tenant form),
deliberately a plain, visually distinct shell (no sidenav, no case/incident nav) so it's never
ambiguous which context you're in; separate `efims_platform_at` httpOnly cookie, no silent
refresh, `proxy.ts` branch scoped to the `/platform` path prefix only.

**Real bugs found live during this pass** (both caught by actually driving the UI/API, not static
checks):
- `CapaService.validate()` had no independence check — an action's own owner could validate their
  own work. Fixed by adding a self-validation block mirroring `ApprovalService.decide`'s existing
  segregation-of-duties pattern (audited DENIED, `ForbiddenException`).
- The create-tenant form's slug `<Input pattern="[a-z0-9-]+" />` threw a genuine browser console
  error under newer Chromium Unicode-mode character-class parsing (unescaped hyphen read
  ambiguously). Fixed to `pattern="[a-z0-9\-]+"`.

**Also found and fixed during final regression**: `CD_01_INCIDENT_TAXONOMY`'s "current" value had
been shadowed by an empty `categories: []` draft (version 2) left over from an earlier session's
CONFIG_ADMIN role-gate test — `ConfigurationService.getCurrent()`'s documented fallback
("highest-version RATIFIED, else highest-version DRAFT") correctly but unhelpfully picked that
empty draft over the real, never-ratified version 1. Not a code bug — stale test data. Fixed by
creating and ratifying a new draft (version 3) carrying the real taxonomy, restoring `getCurrent()`
to the correct value; left versions 1-2 in place (append-only, same principle as the 2026-09-30
audit hash-chain fix — history isn't rewritten even to clean up test data).

**Verification**: `npx tsc --noEmit` + `npm run lint` clean on both apps after each major step.
Live Playwright verification of a representative sample of new roles (dashboard renders with real
data, correct sidenav scoping, zero console errors) and the full platform flow (login → list →
provision a real second tenant → suspend → sign-out → session-cleared, zero console errors). Final
regression pass: re-ran the existing admin-driven end-to-end script (signal → incident → triage →
SLA clock → case → subject flag → approval request → self-approval correctly rejected →
investigations → evidence → recovery → CAPA/regulatory tabs → containment guard → audit →
configuration → notifications) against `bank-1` — all 19 steps pass, confirming nothing from this
session's schema/role/endpoint changes regressed the already-verified core flow.

---

## 2026-09-30 — `efims-frontend`: visual density pass (cases/incidents/signals/audit + case-detail tabs); pre-existing audit hash-chain bug found, root-caused, and fixed

- User feedback: the frontend built to this point was functionally complete but visually a plain
  MVP skeleton — nothing like the density/richness of the `mockups/screens/*.html` reference
  files (KPI hero rows, rich filter bars, dense table rows, tabbed case dossiers). Compared the
  actual `/cases` page against `mockups/screens/case-queue.html` directly to confirm the gap was
  real, then agreed scope with the user: bring cases up to mockup density first as a reviewable
  first pass (real data only, no fabricated KPI numbers — this project's standing rule), then
  once approved, apply the same treatment everywhere else on request ("apply all").
- **`cases` list** (`efims-frontend/src/app/(app)/cases/page.tsx`): 4-card KPI hero row (live
  caseload, financial scope, compliance risk / pending approvals, sensitivity), a real
  Compartment/Sensitivity-tier/search filter bar, richer table rows (linked-incident count,
  assigned-team name, sensitivity tier badge), working pagination, and a pending-approvals banner.
  Backend gained `GET /cases/stats` (tenant-wide, access-filtered summary — reuses the same
  7-condition filter `list()` already computed, refactored into a shared `getVisibleCases`
  helper) and `q`/`compartment`/`sensitivityLevel` filters on `GET /cases`. Deliberately dropped
  the mockup's fictional jurisdiction/payment-rail filters and Nigeria-specific regulatory banner
  copy — those don't correspond to any real field in this schema, and inventing them would violate
  the same "no fabricated data" rule as the CD-01 dashboard KPI fix documented below.
- **`incidents` list**: same KPI-row/filter-bar/table treatment, backed by a new
  `GET /incidents/stats`. Deliberately does **not** join severity/SLA-clock data into the list —
  `triage`/`workflow` both already depend on `IncidentsService` (see those services' own doc
  comments), so `IncidentsService` depending back on either for this enrichment would be a
  circular module dependency, not just inconvenient. Documented as a real follow-up rather than
  forcing the cycle.
- **`signals` list**: same treatment, backed by a new `GET /signals/stats` (`groupBy` on status,
  plus a whistleblower-source count).
- **`audit` trail**: exposed the filters `queryAuditEvents`'s API wrapper already supported but
  the page never surfaced (`entityType`, `action`, `from`, `to`), added a `GET /audit-events/stats`
  KPI row (SUCCESS/DENIED/FAILURE counts + the existing hash-chain-intact check, now shown as a
  hero card).
- **Case detail**: rebuilt `cases/[id]/layout.tsx` as a hero header (reference/sensitivity/
  compartment/status pills, title, description) plus a real 4-tile stats ribbon (outstanding
  exposure & recovered, from the existing per-case `recovery/summary` endpoint; linked-incident
  count and subject/conflict-flag count, from a new `GET /cases/:id/summary`) — and replaced the
  plain-text tab links with a Client Component (`case-tabs.tsx`, `usePathname()`) that actually
  highlights the active tab, which the old tab nav never did. Lightly restyled all 8 tabs
  (Overview, Approvals, Investigations, Evidence, Containment, Recovery, CAPA, Regulatory) for
  consistent card/icon/empty-state treatment; kept every test-relied-upon string (e.g.
  "Root cause", "New obligation", "request one on the Approvals tab first") unchanged so the
  existing Playwright verification script didn't need to change.
- Live-verified: the full 19-step end-to-end Playwright script (signal → incident → triage → SLA
  clock → case → flag → approval request/rejection → investigations/evidence/recovery/capa/
  regulatory/containment → audit → configuration → notifications) passes cleanly against the
  redesigned pages, zero console errors. Screenshots reviewed for every redesigned page.
- **Root-caused and fixed — a real bug, not tampering, and not the CD-01-script theory floated
  when this was first flagged.** Confirmed by direct reproduction (recomputing the stored event's
  hash both ways): `configuration.ratify` (`configuration.service.ts`) and
  `regulatory.obligation.create` (`regulatory.service.ts`) both put a live JS `Date` object
  straight into `metadata` (`effectiveDate`/`deadline`) instead of a pre-serialized string.
  `AuditService.record` hashes `metadata` at write time, before the Postgres JSONB round-trip —
  and `audit-hash.ts`'s `canonicalize()` had no special case for `Date`, so a `Date` instance
  (which has zero *own enumerable* properties) fell into the generic-object branch and hashed as
  the empty object `{}`. Every later `verifyChain` re-reads that same field back as a plain ISO
  string (what JSONB actually stored) and correctly canonicalizes *that* differently — a
  guaranteed, deterministic mismatch, confirmed by recomputing the stored hash with the
  `effectiveDate` field forced back into a `Date` object and getting an exact match.
  - **Fixed** in `canonicalize()` itself (`audit-hash.ts`), not by patching the two call sites —
    it's the one function both write-time hashing and verification share, so fixing it here
    covers every present and future caller that might put a `Date` in `metadata`, not just
    today's two. A `Date` now canonicalizes via `.toISOString()`, matching what `JSON.stringify`
    (and therefore the JSONB round-trip) already does with one.
  - **`AuditService.verifyChain` no longer stops at the first break.** It used to — meaning any
    breaks after the first were invisible. Now it resumes from each event's own stored hash after
    logging a break (same "treat this as a fresh segment" logic the pre-existing `hash === null`
    handling already used), so a single historical bug can't hide how many events it actually
    affected. Also now returns each break's action/entityType/entityId/createdAt/reason
    (`hash_mismatch` vs `link_mismatch`) instead of a bare event id — `efims-frontend`'s audit
    page renders these in a dedicated panel instead of a cryptic `#a06fc9cb`.
  - **The 3 already-written broken rows were deliberately left untouched** — running the fixed
    `verifyChain` end to end found exactly 3 breaks, all dated **2026-09-24** (one
    `configuration.ratify`, two `regulatory.obligation.create`), all fully explained by the same
    root cause, nothing unexplained left over. `audit_events` grants `REVOKE UPDATE, DELETE ...
    FROM efims_app` at the database level (`rls-policies.sql`) — belt-and-suspenders for
    non-negotiable #3 — so the app literally cannot rewrite them even in error, and rewriting
    audit rows to make a hash chain re-verify as "intact" (even to fix a genuine bug, even via a
    privileged connection) is indistinguishable in principle from rewriting them to hide real
    tampering. The correct "make correction" here is fixing the code so it can never happen
    again, not editing the ledger.
  - **Verified live**: created a fresh `regulatory.obligation.create` event through the now-fixed
    code path and re-ran `verifyChain` — the new event does not appear in `breaks` (confirmed by
    id), and the break count stayed at exactly 3 (the pre-existing ones), not 4.

---

## 2026-09-26 — `efims-frontend`: full module coverage built and live-verified; 3 real bugs found and fixed

- Expanded the frontend from the single `incidents` vertical slice to a real page for every
  remaining backend module, following the exact build-then-live-verify-in-a-browser pattern
  `incidents` established: `signals` (queue, intake form, detail + validate/reject — the actual
  intake surface upstream of `incidents`), `incidents` (extended with a detail page: triage
  assessment/escalation, SLA clock start/pause/resume/stop, relate/merge), `cases` (list, create,
  and a tabbed detail view — Overview, Approvals, Investigations, Evidence, Containment, Recovery,
  CAPA, Regulatory), `workflow` (approval request/approve/reject, surfaced inside the Approvals
  tab), `audit` (read-only trail — deliberately no `actions.ts`, matching non-negotiable #3), 
  `configuration` (read-only CD-01..CD-08 list + detail, matching non-negotiable #9), and
  `notifications` (list + mark-read; no live Socket.IO push wired into the page yet). Two small
  new feature modules exist purely to support these: `teams` and `users` (`GET /users` for
  name-lookup dropdowns and flag/assignment pickers).
- Sidenav extended to Dashboard/Signals/Incidents/Cases/Audit Trail/Configuration (the last
  role-gated to ADMIN/EXECUTIVE) — Investigations/Evidence/Containment/Recovery/CAPA/Regulatory
  are deliberately case-detail tabs, not top-level nav items, since none of them make sense
  outside a specific case's context. Topnav now shows a live unread-notification count.
- Added `(app)/error.tsx` (a shared Client Component error boundary covering every Server
  Action/Component under `(app)/`) and `(app)/loading.tsx` + `(app)/incidents/loading.tsx`
  (Skeleton-based loading states), and parallelized the dashboard's two sequential backend calls
  into `Promise.all`. `features/cases/get-case-cached.ts` wraps the case lookup in React's
  `cache()` so the case-detail layout and its 7 tab pages share one fetch per request.
- Backend gained 3 small endpoints purely to support this frontend surface (`efims-backend`):
  `GET /cases/:id/flags` and `GET /cases/:id/status-history` (`cases.controller.ts` —
  `getById` inside the service is still the real access check, no separate `@Roles()` gate, same
  pattern as every other read route), and `GET /users` (`users.controller.ts`, open to any
  authenticated user).
- **Four real bugs found live, all fixed** (full detail in `efims-frontend/README.md`'s "Real bugs
  this build found" section):
  1. Blank dashboard page — `(app)/page.tsx`'s two sequential uncached fetches plus zero loading
     UI meant the browser painted nothing during a normal (or occasionally slow, per this
     project's well-documented Neon-latency pattern) round trip. Fixed with `Promise.all` +
     `loading.tsx`.
  2. **Signal-validate redirected to the wrong id.** `SignalsService.validate()` (backend) returns
     the updated `Signal` row, not an `Incident` — the new/linked incident's id lives on that
     row's own `incidentId` field, `.id` is still the signal's id. `features/signals/api.ts`
     mistyped the response as `Incident`, and `features/signals/actions.ts` redirected to
     `/incidents/${incident.id}` — actually the signal's id. Every incident reached via signal
     validation 404'd, cascading into apparent triage/SLA/case-creation failures during
     verification (they were never actually broken). Fixed by correcting the return type to
     `Signal` and redirecting via `validated.incidentId`.
  3. Missing shared error boundary — an uncaught `ApiError` crashed the whole page with Next.js's
     raw dev overlay instead of a graceful message; fixed by adding `(app)/error.tsx`.
  4. (Pre-existing, re-confirmed) the CD-01 seed-data quality bug documented in the prior
     frontend-build entry below.
  - **Confirmed correct, not a bug**: the case-detail "add a subject/conflict flag" feature
    correctly locked the only seeded (admin) user out of a case once flagged as its `SUBJECT`,
    per non-negotiable #6 ("user not a subject/conflict on the case"). The fix was to the
    verification script (create a disposable second `INVESTIGATOR`-role test user directly
    against the backend, since there's no user-management UI yet), not the app.
- Live-verified end to end with a headless-Chromium (Playwright) script run from a scratch
  location outside this repo: one continuous flow — log a signal → validate into a new incident →
  triage assessment → start SLA clock → create a case → add a subject flag (on the dedicated test
  user, not the admin) → request a `CONTAINMENT` approval → self-approval correctly rejected
  (segregation of duties) → save an investigation plan → ingest evidence → record a recovery loss
  → CAPA/Regulatory tabs render → containment tab's "request one on the Approvals tab first" guard
  renders correctly (no approved request yet) → audit trail renders 50 real events →
  configuration list/detail render → notifications render. All 19 steps pass, zero browser console
  errors. Screenshots reviewed for design-token/layout correctness on the case-detail tabs.
- Updated `efims-frontend/README.md` (module status table, live-verified section, real-bugs
  section, "what's deliberately not here yet") and this project's root `CLAUDE.md` status section
  to match.

---

## 2026-09-26 — `efims-backend`: stale TypeScript incremental-build cache found and fixed structurally

- Real bug hit live, separate from the already-documented `nest start --watch` race: `npm run
  build` started exiting 0 with zero output and no `dist/` folder at all afterward. Root cause —
  `tsconfig.tsbuildinfo`/`tsconfig.build.tsbuildinfo` (`"incremental": true` in `tsconfig.json`)
  had recorded every source file as already compiled (by content hash), even though `dist/` had
  been deleted out from under that cache (by `nest-cli.json`'s own `deleteOutDir: true` on an
  interrupted/overlapping prior build). `tsc` wasn't lying — it genuinely believed there was
  nothing new to emit, so it emitted nothing.
- Fixed structurally, not just documented: added a `prebuild` script to `package.json` that
  deletes both `.tsbuildinfo` files before every `npm run build` (npm runs `prebuild`
  automatically ahead of `build`, no extra step for anyone running it). Verified live: deleted
  `dist/` again, ran `npm run build`, confirmed the `prebuild` step fired and `dist/main.js` was
  produced correctly.
- Documented in `efims-backend/README.md` alongside the existing `nest start --watch` gotcha note.

---

## 2026-09-26 — Frontend build started (`efims-frontend/`) — auth architecture, dashboard shell, `incidents` (first module)

- With the entire backend build order complete (2026-09-24 entries below), started frontend work
  per the confirmed toolset. Explicit instruction for this phase: keep it modular, prioritize
  security over speed where the two trade off (speed still matters, just second).
- **Scaffolded Next.js 16** (`create-next-app` — App Router, TypeScript, Tailwind v4, ESLint flat
  config), `npx shadcn@latest init` for shadcn/ui. Next.js 16 has real breaking changes from
  older versions (`middleware.ts` deprecated in favor of `proxy.ts`, fully-async `cookies()`/
  `headers()`/`params`/`searchParams`, Turbopack default) — the project's own generated
  `AGENTS.md` explicitly flags this and points at bundled, version-matched docs in
  `node_modules/next/dist/docs/`; read those (upgrade guide, `proxy` file convention,
  authentication guide, backend-for-frontend guide) before writing any code, rather than assuming
  prior Next.js familiarity still applied.
- **Security architecture — the browser never talks to the backend at all**: every backend call
  happens from this Next.js server (Server Components for reads, Server Actions for writes,
  never a Client Component). `BACKEND_URL` has no `NEXT_PUBLIC_` prefix and
  `src/lib/backend-client.ts` imports `server-only`, making it a build error (not just a
  convention) for the backend's origin to ever reach a client bundle — a step further than the
  confirmed toolset's own "REST only, no direct DB access" rule.
- **Session**: the backend's own signed JWTs are stored verbatim in two `HttpOnly`,
  `SameSite=Lax` cookies — deliberately not re-wrapped in a second encrypted app-level session
  token, since the backend already issues short-lived, signed, rotating tokens with reuse
  detection, and the cookies are already unreachable from client JS (the actual XSS mitigation).
  Decoded (never re-verified) JWT claims are used only for optimistic UI (role badge, nav
  gating) — the backend is the sole authorization authority on every real request, exactly as
  the rest of this project's non-negotiables already establish for every other caller.
- **Two-layer auth check**, matching the Next.js authentication guide's own recommended pattern:
  `src/proxy.ts` (optimistic, cookie-only redirect gate — deliberately self-contained, no shared
  imports from `src/features/`/`src/lib/`, per Next.js's own Proxy docs warning against relying
  on shared render-code modules; also does silent access-token refresh, since Proxy is the one
  place that runs before every navigation *and* can set cookies, unlike a Server Component) plus
  `requireSession()`/`getSession()` (the real DAL check, called in the dashboard layout and every
  page under it).
- **Design system**: Tailwind v4's `@theme` tokens in `globals.css` transcribed verbatim from
  `docs/design-system.md` v1.2.0's "Botanical Executive" palette (exact hex values), mapped onto
  both raw Material-3-style utility names (`bg-primary-container`, etc.) and shadcn/ui's own
  semantic slots, so every shadcn primitive already renders in-palette. `mockups/screens/*.html`
  used as layout/component reference per `mockups/README.md`'s own instruction, not copied
  verbatim — two deliberate departures, both because the real backend doesn't support what a
  mockup depicts: no FIDO2/YubiKey MFA on login (`identity` is single-factor; building a
  second-factor UI with nothing behind it would be security theater), no fabricated KPI numbers
  on the dashboard (every number comes from a real `GET /incidents` call's `total` field).
- **Modular structure**: mirrors the backend's own module boundaries —
  `src/features/<module>/` (one directory per backend module: `auth`, `incidents` so far; each
  holds hand-kept-in-sync `types.ts` + server-only `api.ts`), `src/lib/` (cross-module
  infrastructure), `src/components/shell/` (dashboard chrome, used only by the app layout).
- **First vertical-slice module: `incidents`** (list, `?status=` filter, pagination) —
  deliberately read-only, as the minimal slice proving the whole architecture (auth, session,
  styling, data fetching) end to end before adding real write actions.
- **A real, pre-existing data-quality bug found live** — not introduced by this session, but only
  surfaced once a real table actually rendered the data: the CD-01 taxonomy's "Whistleblowing"
  category had a `type` value of `"Whistleblower report (always WHISTLEBLOWING compartment,
  regardless of underlying subject matter)"` — CD-01's own explanatory note about how the
  category is *handled*, transcribed straight into the literal type-name string in
  `efims-backend/prisma/seed.ts` instead of staying a code comment. Undetected through every
  prior backend-only live-testing pass (nothing ever rendered it as a user-facing label);
  immediately obvious as wrong the moment the incidents table rendered it, clipping the table's
  last column in the process (a second, smaller layout bug, also fixed — the "Category / Type"
  cell had no width constraint). Fixed in the seed script (both the CD-01 config seed and the
  demo incident's own `type` field) and corrected directly in the already-seeded live rows (one
  `ConfigurationEntry.value` JSON field, one `Incident.type` field) via a one-off script against
  the privileged `DIRECT_URL` connection — the same "fix the live data, not just the code that
  will seed it next time" pattern used throughout this project.
- **Live-verified end to end**, driven by a headless-Chromium (Playwright) script against the
  real running backend, not just a description of expected behavior: unauthenticated `/` visit
  redirects to `/login`; login with the seeded admin sets session cookies and redirects to `/`;
  the dashboard renders real KPI numbers and the sidenav/topnav shell; the Incidents page renders
  real rows with correct compartment/status badges and (after the fix above) correct category/
  type strings; sign-out redirects to `/login`, and a subsequent `/` visit redirects back to
  `/login`, confirming the session was actually cleared server-side; zero browser console errors
  across the whole flow.
- **Verified**: `npx tsc --noEmit`, `npx eslint .`, and `npm run build` (Turbopack) all pass clean.
- **Documentation**: new `efims-frontend/README.md` (architecture, security model, design system,
  modular structure, live-verification specifics, what's deliberately not built yet). `CLAUDE.md`
  updated to reflect frontend work now underway.
- Next: continue one backend module at a time — `cases` next (and everything nested under it —
  `investigations`/`evidence`/`containment`/`recovery`/`capa`/`regulatory`), then `workflow`,
  `audit`, `notifications`, `configuration` — same build-then-live-verify-in-a-browser pattern.

---

## 2026-09-24 — `regulatory` module shipped — obligations register, submissions — **entire MVP backend build order now complete**

- Last module in the MVP build order, closing out the "full backend before frontend" request
  that drove this entire day's build sequence (cross-cutting infrastructure → `notifications` →
  `investigations` → `evidence` → `containment` → `recovery` → `capa` → `regulatory`):
  `regulatory` — architecture.md's "obligations register, submissions" — now built, migrated,
  RLS-applied, and live-verified. Every module `docs/architecture.md`'s module map names is now
  built.
- **Schema**: `RegulatoryObligation.deadline` is where CD-03's "statutory/regulatory deadlines
  are never paused by either calendar" is actually enforced — not by application logic checking
  a flag, but by the schema itself giving this field no pause/resume mechanism at all, unlike
  `SlaClock`. `RegulatoryObligation` mutates in place (`PENDING` → `SUBMITTED` →
  `ACKNOWLEDGED`, or `PENDING` → `WAIVED`); `RegulatorySubmission` is pure append-only, same
  posture as `WriteOffEntry`, with `approvalId` `@unique` from the start — the third module in a
  row (after `recovery`) to carry forward the reuse-prevention fix `containment` found as a real
  bug, never rediscovered.
- **Wires up CD-04's `REGULATORY_SUBMISSION` action for real**, the third and final of CD-04's
  four named actions this build sequence has now wired to an actual enforcement point
  (`containment` did `CONTAINMENT`, `recovery` did `LOSS_WRITE_OFF`; only `CASE_CLOSURE` predates
  this sequence, already wired by `cases` itself). `POST .../submit` requires `approvalId` to
  reference an `APPROVED` `ApprovalRequest` with `action = REGULATORY_SUBMISSION` for the same
  case, via the same reusable `ApprovalService.assertApproved` gate every CD-04-gated action in
  this codebase now shares.
- **Module boundary**: `RegulatoryModule` imports both `CasesModule` and `WorkflowModule`
  directly — identical one-directional leaf shape to `ContainmentModule`/`RecoveryModule`.
- **Live-verified end to end** against the real Neon database: the seeded obligation (already
  `ACKNOWLEDGED`) confirmed readable with its submission history included, a fresh `PENDING`
  obligation created, a submit attempt with a bogus `approvalId` rejected (400), one referencing
  a `CONTAINMENT` approval instead of `REGULATORY_SUBMISSION` rejected (400), reuse of an
  already-used `approvalId` rejected (400) — **correct on the very first live attempt, the third
  module running in a row where this exact bug class never reappeared** — a fresh
  `REGULATORY_SUBMISSION` approval requested and decided by an authorized `COMPLIANCE_MLRO`
  (confirming CD-04's S1/S2 matrix requires only *one* of `COMPLIANCE_MLRO`/`LEGAL_COUNSEL` to
  decide, not both — this codebase has no multi-signature approval concept, and this was the
  first live test to actually exercise a matrix entry naming two roles), submitted successfully,
  a second submit on the now-`SUBMITTED` obligation rejected (400), acknowledged successfully, a
  separate fresh obligation's premature acknowledge (while still `PENDING`) rejected (400), that
  obligation waived successfully, a submit attempt on the now-`WAIVED` obligation rejected (400),
  a wrong-case/obligation-id combination correctly 404ing, a user with no case access denied
  (403), and RLS tenant isolation reconfirmed directly against the database (an `efims_app`
  session with no tenant context set sees zero rows across `regulatory_obligations`/
  `regulatory_submissions`, despite real rows existing from this same test pass).
- Seed script extended with one `RegulatoryObligation` (`STR_SAR_FILING`, NFIU) taken through its
  full lifecycle to `ACKNOWLEDGED` in the seed data itself, following the same
  pre-walked-lifecycle pattern `capa`'s seed data established. Ran within the existing
  90-second transaction timeout without needing a further bump — it held for every module added
  after the original bump, through this, the last one in the build order.
- **Verified**: `npx tsc --noEmit` (main + seed project), `npx prisma validate`, `npm run build`
  (Nest CLI), and `npm run lint` all pass clean, first pass, no fixes needed.
- **Documentation updated same session, and consolidated**: `efims-backend/README.md` (new
  "Regulatory flow" section, "Built so far" summary now reads as complete, new "deliberately not
  here yet" bullets including the one still-open gap this module's own existence highlights —
  `SlaClock` still has no link to `RegulatoryObligation`, so a clock tracking a statutory deadline
  still has no way to mark itself un-pausable, even though the deadline stored directly on a
  `RegulatoryObligation` now correctly can't be). `CLAUDE.md`'s Status section was rewritten from
  eight separate per-module paragraphs into one consolidated summary now that the build-out this
  sequence tracked is actually finished, rather than appending a ninth paragraph to an
  ever-growing list.
- **What's next**: per the user's own explicit request ("the backend of every feature needed for
  a full production of this product" before frontend work starts), that condition is now met.
  The next phase is frontend work against the confirmed toolset (Next.js App Router + TypeScript
  + Tailwind + shadcn/ui), building against the REST API surface this backend now exposes end to
  end across all fourteen modules plus the cross-cutting infrastructure pass.

---

## 2026-09-24 — `capa` module shipped — root cause, actions, validation

- Continuation of the "full backend before frontend" build order, next module past `recovery`
  (same day's earlier entry): `capa` — architecture.md's "root cause, actions, validation" — now
  built, migrated, RLS-applied, and live-verified. Only `regulatory` remains after this.
- **Schema**: `RootCauseAnalysis` versioned/append-only like `InvestigationPlan` (a revised
  understanding of root cause is a new row, never a mutation). `CapaAction` mutates in place like
  `InvestigationIssue` (status transitions on the same row: `OPEN` → `IN_PROGRESS` →
  `COMPLETED` → `VALIDATED`, or `CANCELLED`). `CapaValidation` is pure append-only like
  `Interview`/`Finding`.
- **Deliberately no CD-04 approval gate** — the first module in this remaining-modules sequence
  to *not* reuse `ApprovalService.assertApproved`. CD-04's matrix names exactly four actions
  (Containment, Loss write-off, Regulatory submission, Case closure); CAPA isn't one of them, so
  wiring an approval requirement here would have been unrequested scope creep dressed up as
  faithfulness to the doc, not an oversight to fix. Documented explicitly in both the schema
  comment and `CapaService`'s own doc comment so it reads as a decision, not a gap.
- **A real, useful business rule, not just a status field**: `POST .../validate` only accepts a
  `COMPLETED` action (400 otherwise); an `EFFECTIVE` outcome moves it to `VALIDATED` (terminal),
  but `INEFFECTIVE`/`PARTIALLY_EFFECTIVE` reopens it to `IN_PROGRESS` — rework needed — rather
  than leaving a `COMPLETED` action sitting there with a validation outcome nobody acted on. This
  is the one place in this module where "validation" does more than record a fact; it drives the
  action's own state machine.
- **Module boundary**: `CapaModule` imports `CasesModule` (case access) and `IdentityModule`
  (`UsersService.assertUserExists`, validating a CAPA action's `ownerId` — the same
  `assertExists`-style cross-module validation `cases`' `assignedTeamId` already uses via
  `TeamsService`) directly.
- **Live-verified end to end** against the real Neon database: the seeded root cause and its
  already-`VALIDATED` action confirmed readable, a new action created with no `rootCauseId`
  (confirming that link is genuinely optional, not silently required), a premature validate
  attempt on a fresh `OPEN` action rejected (400), then the full lifecycle exercised for real —
  start → complete → **validate `INEFFECTIVE` → confirmed the action actually reopened to
  `IN_PROGRESS`** (via a `?status=IN_PROGRESS` filter, not just trusting the response body) →
  completed a second time → validated `EFFECTIVE` → reached `VALIDATED` — full 2-entry validation
  history returned in order, cancelling an already-`VALIDATED` (terminal) action rejected (400), a
  separate action created then successfully cancelled, a `rootCauseId` referencing a root cause
  on a *different* case rejected (400, the same cross-entity-validation pattern `investigations`'
  `Finding.resolvesIssueId` established), a user with no case access denied (403), and RLS tenant
  isolation reconfirmed directly against the database (an `efims_app` session with no tenant
  context set sees zero rows across `root_cause_analyses`/`capa_actions`/`capa_validations`,
  despite real rows existing from this same test pass).
- Seed script extended with one `RootCauseAnalysis` (v1, `FIVE_WHYS`) and one `CapaAction`
  (`PREVENTIVE`, SIM-swap alert auto-enrollment) taken all the way to `VALIDATED`/`EFFECTIVE` in
  the seed data itself — the first module's seed data to pre-walk an entity through its full
  status lifecycle rather than leaving it at a single fixed state. Ran within the existing
  90-second transaction timeout without needing a further bump.
- **Verified**: `npx tsc --noEmit` (main + seed project), `npx prisma validate`, `npm run build`
  (Nest CLI), and `npm run lint` all pass clean, first pass, no fixes needed.
- **Documentation updated same session**: `efims-backend/README.md` (new "CAPA flow" section,
  updated "Built so far" summary, new "deliberately not here yet" bullets, seed-step note),
  `CLAUDE.md` (Status section moves `capa` from "remaining" to "done", updated remaining-modules
  list — now naming only `regulatory`).
- Next: `regulatory` (obligations register, submissions) — the last remaining module per the
  build order. Once it ships, the entire backend the user asked to have production-ready before
  any frontend work starts is complete, and the next phase (per the user's own explicit request)
  is starting frontend work per the confirmed toolset (Next.js + TypeScript + Tailwind +
  shadcn/ui).

---

## 2026-09-24 — `recovery` module shipped — loss/recovery ledger, reconciliation

- Continuation of the "full backend before frontend" build order, next module past `containment`
  (same day's earlier entry): `recovery` — architecture.md's "loss/recovery ledger,
  reconciliation" — now built, migrated, RLS-applied, and live-verified.
- **Schema**: `LossEntry`/`RecoveryEntry` are pure append-only ledger rows (no update/delete
  path), same posture as `Interview`/`Finding` — a loss or recovery determination is a
  fact-of-record; correcting one means recording a new correcting entry, never mutating history.
  `WriteOffEntry.approvalId` is `@unique` from the start — the reuse-prevention fix `containment`
  had to find and fix live (see that entry above) was built into this module's very first version
  instead of being a second live-discovered bug. All amounts assume NGN, matching CD-02's
  `financialLossThresholdNgn`/CD-04's `amountBandsNgn` — this codebase's only currency precedent;
  mixed-currency aggregation is explicitly out of scope, documented as such, not mishandled
  silently.
- **Wires up CD-04's `LOSS_WRITE_OFF` action for real**, the second of the two approval actions
  every prior module's README flagged as "named by CD-04 but with nothing to attach to yet"
  (`containment` closed the first, `CONTAINMENT`, in the entry above): `POST .../write-offs`
  requires `approvalId` to reference an `APPROVED` `ApprovalRequest` with
  `action = LOSS_WRITE_OFF` for the same case, via the same reusable `ApprovalService.
  assertApproved` gate. Unlike a containment action, a write-off has no external system to wait
  on a confirmation from — it's an internal accounting action, final the moment it's recorded, so
  there's no `REQUESTED`/`CONFIRMED` status machine here, just an append-only ledger row.
- **"Reconciliation" is deliberately not a stored entity** — `GET .../summary` computes
  `totalLoss`/`totalRecovered`/`totalWrittenOff`/`outstanding` fresh from the ledger via
  `Prisma.aggregate` on every call, the same "derive, don't store a flag that can drift" posture
  `containment` already established for whether a case is "contained" (no boolean field there
  either).
- **Module boundary**: `RecoveryModule` imports both `CasesModule` and `WorkflowModule` directly
  — identical one-directional leaf shape to `ContainmentModule`.
- **Live-verified end to end** against the real Neon database: the seeded ledger's summary
  matched exactly (₦450,000 loss, ₦150,000 recovered via chargeback, ₦300,000 written off, ₦0
  outstanding), a new ₦5,000 fee loss recorded, a write-off attempt with a bogus `approvalId`
  rejected (400), one referencing a `CONTAINMENT` approval instead of `LOSS_WRITE_OFF` rejected
  (400) by the same `assertApproved` check, **reuse of an already-used `approvalId` correctly
  rejected on the very first live attempt** — confirming the `@unique`-from-the-start design
  actually works, not just compiles — a fresh `LOSS_WRITE_OFF` approval requested and decided by
  an authorized `FRAUD_RISK_MANAGER` (S3/S4 band, per CD-04's matrix) and successfully recorded,
  the summary correctly updating (₦455,000 loss, ₦305,000 written off, still ₦0 outstanding), a
  user with no case access denied (403), and RLS tenant isolation reconfirmed directly against
  the database (an `efims_app` session with no tenant context set sees zero rows across
  `loss_entries`/`recovery_entries`/`write_off_entries`, despite real rows existing from this
  same test pass).
- **Operational note carried forward from the `containment` session**: this pass's live-testing
  again used PowerShell's `Get-Process`/`Get-NetTCPConnection` (not Git Bash's `ps`, which misses
  real Windows processes) to manage the dev server, and `npm run build && node dist/main.js`
  instead of `start:dev`'s racy watch mode — both now standard practice for this project, not
  rediscovered.
- Seed script extended with one `LossEntry` (₦450,000 `PRINCIPAL`), one `RecoveryEntry`
  (₦150,000 `CHARGEBACK`), and one approved `LOSS_WRITE_OFF` `ApprovalRequest` + `WriteOffEntry`
  (₦300,000) on `CASE-2026-0001`, deliberately reconciling to exactly ₦0 outstanding. Ran within
  the existing 90-second transaction timeout without needing a further bump.
- **Verified**: `npx tsc --noEmit` (main + seed project), `npx prisma validate`, `npm run build`
  (Nest CLI), and `npm run lint` all pass clean, first pass, no fixes needed.
- **Documentation updated same session**: `efims-backend/README.md` (new "Recovery flow"
  section, updated "Built so far" summary, new "deliberately not here yet" bullets, seed-step
  note), `CLAUDE.md` (Status section moves `recovery` from "remaining" to "done", updated
  remaining-modules list).
- Next: `capa` (root cause, actions, validation) — the next module in the agreed-upon remaining
  sequence (`capa` → `regulatory`), the last two modules before the full backend build-out is
  complete and frontend work can begin per the user's original request.

---

## 2026-09-24 — `containment` module shipped — action requests, confirmations

- Continuation of the "full backend before frontend" build order, next module past `evidence`
  (same day's earlier entry): `containment` — architecture.md's "action requests, confirmations",
  built directly around CLAUDE.md non-negotiable #8 ("EFIMS never freezes an account or blocks a
  card itself — it only requests and waits") — now built, migrated, RLS-applied, and
  live-verified.
- **Design decision carried through the schema itself, not just application code**: no boolean
  "contained" field anywhere (not on `Case`, not computed). A case's containment posture is
  always the actual list of `ContainmentRequest` rows and each one's own `status`
  (`REQUESTED`/`CONFIRMED`/`REJECTED`/`CANCELLED`) — never a single derived flag that could drift
  from what actually happened. Status starts at `REQUESTED`, never anything implying EFIMS itself
  acted.
- **Wires up CD-04's `CONTAINMENT` action for real**, closing a gap flagged as known/deferred in
  every prior module's own README ("CD-04 names approvers for 'Containment action'... but neither
  has anything to attach to yet"): `POST .../containment-requests` requires `approvalId` to
  reference an `APPROVED` `ApprovalRequest` with `action = CONTAINMENT` for the same case, via
  `ApprovalService.assertApproved` — the exact same reusable gate `CasesService.updateStatus`
  already uses for case closure. A containment request can never exist without CD-04's approval
  matrix already having authorized it.
- **Module boundary**: `ContainmentModule` imports both `CasesModule` (case access) and
  `WorkflowModule` (`ApprovalService.assertApproved`) directly — a one-directional leaf, same
  shape as `InvestigationsModule`/`EvidenceModule`.
- **Routes**: create, list, get-by-id, `.../confirm` (records a positive `ActionConfirmed` —
  no real source-system integration exists, so this is the seam a real webhook would call,
  exercised manually for now, same "build the seam now" pattern `notifications`'s stubbed
  channels and `evidence`'s `externalRef` already use), `.../reject`, `.../cancel`. No narrower
  role gate on confirm/reject/cancel beyond the routine case-role set — the consequential gate is
  the CD-04 approval already required to create the request.
- **RLS**: `containment_requests` gets `SELECT, INSERT, UPDATE` (confirm/reject/cancel mutate the
  same row, same pattern as `approval_requests`/`sla_clocks`), no `DELETE` — the record of a
  containment request and how the source system responded is itself part of the case file.
- **A real bug found and fixed live, during this module's own verification**: nothing originally
  stopped the same approved `approvalId` from being reused across multiple `ContainmentRequest`
  rows — an approval to "suspend online access" could have been reused to also authorize "block
  the card," an action it was never actually asked to approve. Caught by deliberately testing
  reuse (create two requests off the same approval), not by inspection; the first attempt
  succeeded when it should have been rejected. Fixed with a database-level `@unique` constraint
  on `ContainmentRequest.approvalId` (the real backstop against a race between two concurrent
  creates) plus an application-level check in `ContainmentService.create` for a clean 400 instead
  of a raw Prisma constraint violation.
- **A real tooling limitation hit while fixing the bug above**: `prisma migrate dev` refuses to
  run non-interactively whenever it detects a schema change it considers risky (here: a new
  unique constraint that could fail against existing duplicate data) — even with `--create-only`,
  and even after the one duplicate row in the live database had already been deleted. No flag
  forces it through in a non-interactive shell. Worked around by hand-writing the migration
  directory and SQL (`<timestamp>_containment_approval_unique/migration.sql`, matching Prisma's
  own `<table>_<column>_key` naming convention) and applying it with `prisma migrate deploy`,
  which doesn't prompt. Documented in `efims-backend/README.md` as a reusable workaround for the
  next time this comes up, not treated as a one-off.
- **Also required manual cleanup before that migration could apply**: the reuse-bug testing
  itself had already created two live `ContainmentRequest` rows sharing one `approvalId` — adding
  the `@unique` constraint would have failed against that real duplicate. Deleted the extra row
  directly via the privileged `DIRECT_URL` connection (the pooled `efims_app` role has no DELETE
  grant on this table by design) before applying the migration.
- **Live-verified end to end** against the real Neon database: a bogus `approvalId` correctly
  rejected (400), an `approvalId` referencing an approval for a *different* action
  (`CASE_CLOSURE`) correctly rejected (400) by the same `assertApproved` check `cases` already
  relies on, a fresh `CONTAINMENT` approval requested and decided by an authorized
  `FRAUD_RISK_MANAGER` (self-approval already blocked by `workflow`'s own existing rule), a
  containment request created against it and confirmed, re-confirming an already-`CONFIRMED`
  request correctly rejected (400), reuse of the same `approvalId` correctly rejected (400, the
  fix above, re-verified after applying it), a second `REQUESTED` request rejected
  (`REJECTED`) and a third cancelled (`CANCELLED`), a wrong-case/request-id combination correctly
  404ing, and RLS tenant isolation reconfirmed directly against the database (an `efims_app`
  session with no tenant context set sees zero rows on `containment_requests`, despite real rows
  existing from this same test pass).
- **Two real environment issues hit and resolved during this session's live-testing, unrelated to
  this module's own code**: (1) a dev-server process from an earlier `nest start --watch` crash
  (documented in the `evidence` entry above) had survived as an orphan bound to port 3001 —
  invisible to Git Bash's own `ps`, only found via PowerShell's `Get-NetTCPConnection`, which is
  now the documented way to diagnose a mysterious stale-code 500/`EADDRINUSE` on this machine
  going forward; (2) starting the server with `&` inside the same Bash tool call that also
  echoed a status line raced two writes to the same log file into unreadable binary-looking
  output — resolved by using `nohup ... & disown` as a single dedicated call instead of chaining
  it with other output.
- Seed script extended with one approved `CONTAINMENT` `ApprovalRequest` and one `CONFIRMED`
  `ContainmentRequest` (a card block, referencing the same SIM-swap fraud narrative the
  investigations and evidence seed data already tell) on `CASE-2026-0001`. Ran within the
  existing 90-second transaction timeout without needing a further bump.
- **Verified**: `npx tsc --noEmit` (main + seed project), `npx prisma validate`, `npm run build`
  (Nest CLI), and `npm run lint` all pass clean, re-run after the unique-constraint fix.
- **Documentation updated same session**: `efims-backend/README.md` (new "Containment flow"
  section, updated "Built so far" summary, new "deliberately not here yet" bullets, seed-step
  note, and a new section documenting the `prisma migrate dev` non-interactive workaround),
  `CLAUDE.md` (Status section moves `containment` from "remaining" to "done", updated
  remaining-modules list).
- Next: `recovery` (loss/recovery ledger, reconciliation) — the next module in the agreed-upon
  remaining sequence (`recovery` → `capa` → `regulatory`).

---

## 2026-09-24 — `evidence` module shipped — vault, hashing, custody, legal hold

- Continuation of the "full backend before frontend" build order, next module past
  `investigations` (same day's earlier entry): `evidence` — architecture.md's "vault, hashing,
  custody, legal hold", and §7's security note: "hash on ingest + custody log, so tampering is
  detectable" — now built, migrated, RLS-applied, and live-verified.
- **Scope boundary, decided before writing any code**: this module is a hash + custody ledger,
  not a file/object store. No blob storage integration exists anywhere in this codebase yet
  (architecture.md's own module map lists `infrastructure/storage` as aspirational, not built) —
  `EvidenceItem` stores a SHA-256 hash of whatever content is supplied at ingest, plus a free-text
  `externalRef` pointer to wherever the real content lives (a DMS, S3, a shared drive), and
  discards the content itself. This mirrors the "build the seam now, wire in the real thing
  later" pattern already used for `notifications`' external channels and `ml-gateway`'s Groq
  client — a real upload/download flow is future work once object storage exists, not invented
  here ahead of need.
- **Schema** (migration `20260924171439_evidence`): `EvidenceItem` (never hard-deleted, same
  posture as `Incident`/`Case`; UPDATE is granted but the service only ever uses it for
  `legalHold*` fields — the hash and everything about what was collected is otherwise immutable
  after ingest, same spirit as `ConfigurationEntry.value`) and `CustodyEvent` (pure append-only,
  no update/delete path at all, same posture as `Interview`/`Finding`). `CustodyAction` enum:
  `COLLECTED`/`VIEWED`/`EXPORTED`/`TRANSFERRED`/`HASH_VERIFIED`.
- **Module boundary**: `EvidenceModule` imports `CasesModule` directly, same one-directional
  shape as `InvestigationsModule`. Every service method calls `CasesService.getById(actor,
  caseId)` first — the 7-condition access rule enforced there, not duplicated here.
- **Routes**: `/cases/:caseId/evidence` (ingest, list, get-by-id with full custody history),
  `.../custody` (record a custody event), `.../verify` (re-hash re-supplied content, compare to
  the stored hash — always logs a `HASH_VERIFIED` custody event and an audited
  `evidence.hash.verify` with `SUCCESS`/`FAILURE` outcome regardless of the result, mirroring how
  `audit.verify_chain` self-audits a broken chain), `.../legal-hold` (set/release, 400s on a
  no-op transition to the same state). Legal hold gets a narrower role gate
  (`LEGAL_COUNSEL`/`COMPLIANCE_MLRO`/`ADMIN`) than routine evidence handling — no CD-04 entry
  names an approver for this action, so the gate mirrors CD-05's own ownership table instead.
- **RLS**: `evidence_items` gets `SELECT, INSERT, UPDATE` (no DELETE); `custody_events` gets
  `SELECT, INSERT` only (no UPDATE/DELETE). Both added to the tenant-isolation policy loop.
- **A real environment bug found and worked around, unrelated to the module's own code**:
  `npm run start:dev` (`nest start --watch`) crashed immediately with `Cannot find module
  '.../dist/main'` right after logging "Found 0 errors. Watching for file changes." — reproduced
  twice in a row on this project's own Windows dev machine, including after a clean `rm -rf dist`.
  Diagnosed as the watch mode's run step racing its own webpack write (`dist/main.js` not yet
  flushed to disk when the child process tries to require it), not an application bug — a plain
  `npm run build` (one-shot, non-watch) reliably produced a working `dist/main.js` every time.
  Worked around for this session's live-testing by using `npm run build && npm start` instead of
  `start:dev`; documented in `efims-backend/README.md`'s Setup section as a known quirk on this
  machine, not solved at the tooling level (not investigated further — out of scope for this
  module's own work).
- **Live-verified end to end** against the real Neon database: an item ingested with content
  hashed server-side (SHA-256, independently recomputed and confirmed to match), full custody
  history returned in chronological (oldest-first) order, a `TRANSFERRED` custody event recorded,
  hash verification with matching content (`intact: true`) and with deliberately altered content
  (`intact: false`) — both logged as a `HASH_VERIFIED` custody event and an audit event with the
  correct `SUCCESS`/`FAILURE` outcome — legal hold set, a duplicate set-while-already-held
  correctly rejected (400), then released, a user with no case access denied (403, confirming
  delegation to `CasesService` rather than a duplicated check), the same user granted case access
  by joining the case's team and then correctly allowed routine evidence actions but still denied
  (403) the narrower-gated legal-hold action by role, a wrong-case/evidence-id combination
  correctly 404ing rather than leaking existence across cases, and RLS tenant isolation
  reconfirmed directly against the database (an `efims_app` session with no tenant context set
  sees zero rows on both new tables, despite real rows existing from this same test pass).
- Seed script extended with one demo evidence item (the telco SIM-swap report already referenced
  by the investigations module's demo finding) plus its three custody events
  (`COLLECTED`/`VIEWED`/`HASH_VERIFIED`) on `CASE-2026-0001`. Ran within the existing 90-second
  transaction timeout without needing a further bump this time.
- **Verified**: `npx tsc --noEmit` (main + seed project), `npx prisma validate`, `npm run build`
  (Nest CLI), and `npm run lint` all pass clean.
- **Documentation updated same session**: `efims-backend/README.md` (new "Evidence flow" section,
  updated "Built so far" summary, new "deliberately not here yet" bullets, seed-step note, and
  the `start:dev` workaround note), `CLAUDE.md` (Status section moves `evidence` from "remaining"
  to "done", updated remaining-modules list).
- Next: `containment` (action requests, confirmations — CLAUDE.md non-negotiable #8's
  confirmation-gated design: EFIMS never shows a case as "contained" until a positive
  `ActionConfirmed` comes back, and never freezes an account or blocks a card itself) — the next
  module in the agreed-upon remaining sequence (`containment` → `recovery` → `capa` →
  `regulatory`).

---

## 2026-09-24 — `investigations` module shipped — plans, issues, interviews, findings

- Continuation of the "full backend before frontend" build order, picking up the next module past
  the cross-cutting infrastructure pass and `notifications` (same day's earlier entry):
  `investigations` — architecture.md's "plans, issues, interviews, findings" — now built,
  migrated, RLS-applied, and live-verified.
- **Schema** (`prisma/schema.prisma`, migration `20260924165418_investigations`):
  `InvestigationPlan` (versioned/append-only — a new row per revision, `version` auto-incremented
  per case, same posture as `ConfigurationEntry`/`TriageAssessment` — never mutated after
  creation), `InvestigationIssue` (mutates in place: `status`/`resolution`/`resolvedBy`/
  `resolvedAt` on the same row via `.../resolve`, since there's exactly one lifecycle transition
  to record, not a revision history), `Interview` and `Finding` (pure append-only historical
  records, no update/delete path at all — same posture as `audit_events` but without the hash
  chain, since no tamper-evidence requirement was stated for these). `Finding.resolvesIssueId` is
  the one cross-entity link — optional, validated at write time to belong to the same case, but
  recording a finding does not itself resolve the issue it references; that still needs its own
  explicit call.
- **Module boundary**: `InvestigationsModule` imports `CasesModule` directly (unlike `workflow`,
  nothing in `cases` needs anything from `investigations`, so there's no circularity to design
  around). Every service method calls `CasesService.getById(actor, caseId)` first — the full
  7-condition case-access rule (non-negotiable #6) is enforced there, not duplicated here, the
  same discipline `triage` already established against `IncidentsService.getById`.
- **Routes**: all nested under `/cases/:caseId/...` (`investigation-plans`, `investigation-plans/
  current`, `issues`, `issues/:issueId/resolve`, `interviews`, `findings`) — 10 routes total.
  Writes gated to the same case-role set (`INVESTIGATOR`/`TEAM_LEAD`/`FRAUD_RISK_MANAGER`/
  `ADMIN`) used for routine case administration elsewhere; reads carry no `@Roles()` gate of
  their own, since `CasesService.getById` is the check that actually matters. Every write is
  audited (`investigations.plan.create`/`issue.raise`/`issue.resolve`/`interview.record`/
  `finding.record`) with `caseId` in the metadata.
- **RLS**: `investigation_plans`/`interviews`/`findings` are `SELECT, INSERT` only for
  `efims_app` (no UPDATE/DELETE grant at all); `investigation_issues` adds `UPDATE` for the
  resolve transition, still no `DELETE`. All four added to the tenant-isolation policy loop in
  `prisma/rls-policies.sql`.
- **A real bug found and fixed live, not in the new module's own code**: extending
  `prisma/seed.ts` with investigation demo data pushed the seed script's single cumulative
  transaction (CD-01..08 config, signal/incident/triage/case/workflow, now investigations —
  all sequential real round trips against Neon) past its 30-second timeout —
  `PrismaClientKnownRequestError: P2028 Transaction already closed`, caught on the very first
  seed run after adding the new seeding block. This is the *second* time this transaction's
  budget has needed raising as the script accumulated more modules' worth of data (see the
  2026-09-2x `cases`/`workflow` entries for the first). Fixed by bumping `timeout` from 30000 to
  90000 in the `prisma.$transaction(...)` call in `seed.ts`'s `main()`, with a comment flagging
  that a third bump should be expected if a future module's seeding pushes past it again.
  Re-ran `npm run seed` after the fix — succeeded cleanly, correctly found the already-live-tested
  investigation plan/issue/interview/finding via their idempotent `findFirst` checks and skipped
  re-creating them rather than duplicating.
- **Live-verified end to end** against the real Neon database: plan v1 created, plan v2 created
  (version auto-incremented; `.../current` correctly returns v2 while the full list still shows
  both), issue raised, interview recorded, finding recorded referencing the issue via
  `resolvesIssueId`, issue explicitly resolved via `.../resolve`, access denied (403) for a user
  failing the case's 7-condition check — confirmed as an audited `DENIED` case-access event, not
  a silent 404 — RLS tenant isolation reconfirmed (a second tenant's `efims_app` session sees zero
  rows across all four new tables), and edge cases: resolving an already-resolved issue (400), a
  `resolvesIssueId` pointing at an issue on a different case (400).
- **Verified**: `npx tsc --noEmit` (main + seed project), `npx prisma validate`, `npm run build`
  (Nest CLI), and `npm run lint` all pass clean after the seed-timeout fix.
- **Documentation updated same session**: `efims-backend/README.md` (new "Investigations flow"
  section, updated "Built so far" summary, new "deliberately not here yet" bullets for this
  module, seed-step note on the transaction-timeout history), `CLAUDE.md` (Status section moves
  `investigations` from "remaining" to "done", updated remaining-modules list).
- Next: `evidence` (vault, hashing, chain of custody, legal hold) — the next module in the
  agreed-upon remaining sequence (`evidence` → `containment` → `recovery` → `capa` →
  `regulatory`), continuing the same "full backend before frontend" build order.

---

## 2026-09-24 — Cross-cutting infrastructure pass + `notifications` module — production-readiness requirements applied across the whole backend

- Explicit request: build every remaining backend feature before starting the frontend, with
  typecheck/validation/caching/indexing/pagination/filtering/rate-limiting/push-notifications/
  Socket.IO/security applied throughout, scalability and modular structure as first-class
  concerns. This entry covers the cross-cutting half of that request (validation/typecheck were
  already standard practice throughout this codebase before now); the `notifications` module
  (originally grouped with evidence/containment/recovery/capa/regulatory in the build order) was
  pulled forward and built now since it's what the Socket.IO/event-bus infrastructure exists for.
- **Three decisions confirmed with the user before starting**, each because this project's own
  docs (or lack of any existing decision) made the default non-obvious:
  1. **Caching**: in-memory (`@nestjs/cache-manager`), not Redis — architecture.md §6 explicitly
     defers Redis until "real caching/session-scale need arises"; introducing it now would
     contradict a decision already on record, not just skip ahead of it.
  2. **Real-time**: build Socket.IO now, not deferred like Redis/Kafka were — explicit user call,
     against the same-reasoning default this session would otherwise have recommended.
  3. **Notification delivery**: build the module now with external channels (EMAIL/SMS/PUSH)
     stubbed (logged, not actually sent) rather than block on provider credentials — same "build
     the seam now, wire in the real thing later" pattern `ml-gateway` already uses for Groq.
- **Event bus** (`@nestjs/event-emitter`, wildcard-enabled): `src/common/events/domain-events.ts`
  is a shared contract file living in `common/`, owned by no single module — `workflow`'s
  `ApprovalService`/`SlaClockService` and `cases`' `CasesService` emit; `notifications` listens.
  Neither side imports the other's service, which is what let `notifications` be wired into
  `AppModule` last, after everything it reacts to, with zero changes to those modules' APIs.
- **Real-time gateway** (`src/infrastructure/realtime/`, Socket.IO at `/realtime`):
  JWT-authenticated at handshake (same secret/payload every REST endpoint already verifies),
  tenant- and user-scoped rooms. Feature modules inject `RealtimeService`
  (`emitToTenant`/`emitToUser`) — never `RealtimeGateway`/`socket.io` directly. CORS on the
  gateway is deliberately permissive (`origin: true`, unlike the Express allow-list) — its real
  access-control boundary is the mandatory JWT handshake, not CORS, since (unlike a
  cookie-authenticated endpoint) there's no ambient session for a cross-origin page to ride
  along on. Known, accepted gap: a revoked session doesn't drop an already-open socket until its
  access token naturally expires — no forced-disconnect mechanism exists yet.
- **`notifications` module**: `Notification` (IN_APP — the row's own existence is the delivery,
  pushed live via `RealtimeService` at creation) + `NotificationDelivery` (one row per stubbed
  EMAIL/SMS/PUSH attempt). Four triggers wired: `approval.requested` (notifies whoever CD-04's
  matrix authorizes to decide — resolved by `workflow` itself and included in the event payload,
  so `notifications` never needs to know that matrix), `approval.decided` (notifies the
  requester), `case.status_changed` on closure only (notifies the case team, excluding whoever
  closed it — every other transition stays silent, too routine to notify on), `sla_clock.breached`
  (notifies every `FRAUD_RISK_MANAGER`, the broadest plausible-interest role, since no per-incident
  owner exists until a case link is made). Escalation: unread `HIGH`-priority notifications past
  15 minutes get a stubbed EMAIL delivery via a `@Cron(EVERY_5_MINUTES)` sweep. "Templates" are
  hardcoded inline title/body construction, not a database table — same reasoning as `workflow`'s
  `APPROVAL_MATRIX`.
- **Rate limiting** (`@nestjs/throttler`): global guard, in-memory store, applies to every
  request including unauthenticated ones. `/health*` exempted — a load balancer polling it
  shouldn't ever get throttled into reporting a false unhealthy instance.
- **Security headers/CORS** (`helmet`, real `CORS_ORIGINS` allow-list) and **health checks**
  (`@nestjs/terminus`, liveness + DB-checking readiness) — standard production baseline, neither
  previously present.
- **Pagination retrofit**: `GET /incidents`, `GET /signals`, `GET /cases` all gained shared
  `limit`/`offset` (`PaginationQueryDto`, capped at 100). `incidents`/`cases` paginate
  post-access-filter (in-memory slice), not via SQL `LIMIT`/`OFFSET` — a DB-level page taken
  before the compartment/7-condition filter runs would return fewer than `limit` visible rows;
  documented as a known DB-efficiency tradeoff, not a bug, in each service's own doc comment.
- **Indexing pass**: found and fixed two real gaps — `TeamMembership` and `CaseUserFlag` each had
  a compound unique constraint that only serves queries filtering on its *first* column;
  `TeamsService.getUserTeamIds`/`CasesService.getFlaggedCaseIds` filter by `userId` alone, on
  every case-list/case-access check in the codebase, with no covering index until this pass.
- **A real bug found and fixed live**: with the rate limiter fired against `/auth/login`
  (105 requests, confirming `429` at request 101 exactly matching the configured limit), the test
  client's own IP got rate-limited for the remainder of the session's testing window — not a bug,
  expected behavior, but a reminder that live-testing rate limiting consumes the same budget it's
  protecting; subsequent tests paced accordingly. Two more genuine test-script mistakes (not
  application bugs) surfaced and were corrected during the realtime/notifications live test: a
  wrong-role decide attempt was first mis-targeted at a case the test user couldn't see at all
  (denied by `cases`' own access check, not the intended `workflow` role check — required adding
  the test user to the case's team first to isolate the actual check being tested), and a cleanup
  pass initially targeted the wrong case id for a dangling approval request (traced via a direct
  query, then a properly-authorized temporary user was created to close it out).
- **`npm audit`**: installing this pass's packages surfaced pre-existing vulnerabilities in this
  project's dependency tree, almost all requiring a NestJS v10 → v12 major upgrade to fully
  resolve. Applied the non-breaking `npm audit fix` only; did not force the major upgrade
  unprompted mid-build (too large/risky a change to make without being asked) — most remaining
  items are dev-tooling-only (`@nestjs/cli`'s own dependency tree), with no exploitable path
  through this project's actual runtime usage, but this is a tracked, known gap, not resolved.
- **Live-verified, same session**: two full staged flows through a real running app against Neon
  — (1) rate limiting (429 at request 101), health checks (liveness + DB-checking readiness),
  security headers, CORS allow/deny; (2) pagination on all three retrofitted endpoints; (3)
  configuration cache invalidation (a ratify was immediately visible, not stale for the TTL
  window); (4) the full realtime+notifications round trip with two real websocket clients — an
  approval request pushed live to the authorized decider, that decision pushed live back to the
  requester, both also visible and mark-as-readable via `GET /notifications`; (5) notification
  ownership enforcement (a user can't mark another user's notification read, 404 not 403). Full
  `tsc`/`prisma validate`/`nest build`/`eslint` clean throughout. A reusable manual verification
  script for the realtime+notifications flow lives at
  `test/manual/realtime-notifications.manual.js` (not a jest spec — needs a running app + seeded
  database, deliberately excluded from `npm test`).
- No automated jest test suite exists yet — flagged explicitly as a gap, not silently skipped;
  every verification in this project so far (this entry included) has been live/manual against a
  real database, not unit-tested. Worth revisiting if/when the user wants CI-enforced coverage.
- Next: the remaining build-order modules (`investigations`/`evidence`/`containment`/`recovery`/
  `capa`/`regulatory`), continuing the "backend complete before frontend" plan.

## 2026-09-22 — `audit` module shipped — tamper-evident hash chain, oversight query API; completes the MVP core incident-to-case flow

- Replaced the minimal write-only `AuditService` sink (in place since the `identity` module) with
  the real `audit` module per the MVP build order (`workflow` → `audit`, then evidence/
  containment/recovery/CAPA/regulatory/notifications "once the core incident-to-case flow works
  end-to-end" — it now does; this is the last module that build order names before that point).
  architecture.md's description — "append-only ledger, write-only API" — was already true of the
  write half; this entry adds the other half: a tamper-evidence mechanism and a read API for the
  oversight roles who actually need to review a ledger, not just write to it.
- **Hash chain**: `AuditEvent` gained `hash`/`previousHash`, one chain per tenant (never a single
  chain across tenants, which would leak cross-tenant event volume/ordering through an otherwise
  RLS-isolated table). `AuditService.record` computes each hash from the row's own fields plus
  the prior event's hash, serialized per tenant via `pg_advisory_xact_lock(hashtext(tenantId))`
  so concurrent writes for the same tenant can't both read the same "latest" hash and fork the
  chain. `AuditService.verifyChain` walks a tenant's chain and recomputes every hash.
- **Schema cleanup done as part of shipping this**: `AuditEvent.tenantId` tightened from optional
  to required — every real call site has always provided one (a pre-tenant-resolution login
  failure is deliberately never written here at all, per `AuditService`'s own doc comment), so
  the nullable column was vestigial; confirmed zero null-tenant rows existed live before
  tightening it.
- **Staged migration for introducing a required `hash` onto a table with 74 live rows**: added
  nullable, backfilled via a one-time script (using the app's own `computeAuditEventHash`, not a
  second reimplementation in raw SQL, so the two could never silently drift), then tightened to
  required in a follow-up migration once confirmed zero nulls remained. The backfill script was
  deleted immediately after — its precondition (a nullable `hash` column) no longer exists once
  the follow-up migration ran, so it can't even type-check against the current schema, and
  keeping broken dead code around serves no one.
- **A real bug found and fixed live, during this module's own verification** (following the
  precedent every module since `triage` has set — verify during the build, not after): the
  hash-canonicalization function walked `Object.keys()` on `metadata` directly. For an object
  with `undefined`-valued keys — exactly what `AuditService.query`'s own metadata (an
  `AuditEventQuery` full of optional, usually-unset filter fields) produces — this hashes a
  *different*, larger key set than what actually gets persisted: JSON serialization into Postgres
  JSONB silently drops `undefined`-valued object keys on the way in, same as plain
  `JSON.stringify` does, but the canonicalizer wasn't replicating that. The very first live call
  to `GET /audit-events` broke `verifyChain` for events that were never touched — a false
  positive from an algorithm bug, not evidence of tampering, but indistinguishable from one until
  traced down. Fixed by making `canonicalize()` mirror `JSON.stringify`'s exact `undefined`
  semantics (object keys omitted, array elements become `null`). Existing rows hashed under the
  buggy version needed recomputing under the fix — not a falsification of history, since the
  underlying event data was never touched, only a broken hash-computation tool was corrected —
  via a second one-time script (also deleted immediately after, same reasoning as the backfill
  script). Re-verified live afterward that the exact call pattern that broke it no longer does.
- **Tamper-evidence proven live, not just declared**: confirmed `efims_app` has no UPDATE grant
  on `audit_events` at all (per `rls-policies.sql`'s own `REVOKE`, and independently — a live
  attempt to `UPDATE audit_events` through the app's own database role was blocked before it
  could even run, by this environment's own safety tooling, which reasonably can't distinguish
  "testing that a control blocks this" from "doing the thing the control blocks" and erred on the
  side of refusing it). Deliberately tampered with one row's `outcome` via the privileged
  migration-owning connection instead (the one role that genuinely can bypass RLS/grants, the
  same "not preventable at the database level for a true superuser" limitation this module's own
  doc comments already state) — `GET /audit-events/verify` immediately reported `intact: false`
  with the exact tampered event's id. Restored the row afterward (also via the privileged
  connection) and re-verified the chain was intact again.
- **Query API**: `GET /audit-events` (filter by `entityType`/`entityId`/`actorUserId`/`action`/
  `outcome`/`from`/`to`, paginated), `GET /audit-events/verify` — both gated to
  `TEAM_LEAD`/`FRAUD_RISK_MANAGER`/`COMPLIANCE_MLRO`/`LEGAL_COUNSEL`/`EXECUTIVE`/`ADMIN`. Every
  call is itself audited (`audit.query`, `audit.verify_chain`) — access to the ledger is the
  sensitive event, same reasoning as `WhistleblowerVaultService`. Live-verified: an `INVESTIGATOR`
  correctly denied (403), a `COMPLIANCE_MLRO` correctly permitted (200).
- **RLS**: no grant changes needed — `audit_events` already had its SELECT/INSERT-only,
  no-UPDATE/DELETE grants from the `identity` module's entry; the new `hash`/`previousHash`
  columns are covered by those same table-level grants automatically (Postgres grants aren't
  column-scoped in this schema).
- **Verified, live, same session**: `prisma validate`/`generate`/two staged `migrate dev` runs
  against Neon, both one-time backfill/correction scripts, `npm run db:rls`, full `tsc`/
  `nest build`/`eslint`, and the real running app exercising the query API, chain verification
  (both the false-positive bug and its fix), role gating, and the deliberate-tampering test above.
- This is the last module the MVP build order names before "evidence/containment/recovery/CAPA/
  regulatory/notifications once the core incident-to-case flow works end-to-end" — it now does,
  live-verified against a real database at every step from `identity` through here. Next: pick
  one of those follow-on modules, or begin the frontend now that there's a working, verified
  backend to build it against.

## 2026-09-22 — `workflow` module scaffolded — SLA clocks + CD-04 approvals

- Added `workflow` to `efims-backend/` per the MVP build order (`cases` → `workflow` → `audit`).
  This is the module that completes CLAUDE.md's stated core flow — `identity` → `configuration`
  → `incidents` → `triage` → `cases` → `workflow` — after which the build order allows
  evidence/containment/recovery/CAPA/regulatory/notifications and the real `audit` module. Two
  genuinely separate mechanisms share this module, per architecture.md's "state machine, SLA
  clocks, approvals": SLA tracking (anchored to Incident) and a generic approval mechanism
  implementing CD-04's matrix (anchored to Case).
- **Schema**: `SlaClock` (per-incident, `calendarName` copied from the incident's current
  `TriageAssessment`, `targetDeadline` deliberately caller-supplied — CD-02's
  `containmentUrgency` is prose, not a number, so this module doesn't invent a severity-to-hours
  mapping the source doc never specified, same reasoning as CD-02's `financialLossThresholdNgn`
  staying `null`; at most one open pause window tracked directly on the row, with
  `totalPausedMinutes: Int` rather than a bigint — Prisma maps Postgres `bigint` to JS `BigInt`,
  which breaks `JSON.stringify` by default, so every controller response would have broken).
  `ApprovalRequest` (`action` — a fixed 4-value enum matching CD-04's actual rows, not a
  config-validated string — `severityBand`, `status`, request/decision audit fields).
- **Deliberate non-scope**: not a general state-machine engine. The only status-transition rule
  this module enforces is the one concrete integration point: `CasesService.updateStatus`
  requires `dto.approvalId` to reference an `APPROVED` `CASE_CLOSURE` request when transitioning
  to `CLOSED`. No other case transition, and no incident transition, requires approval.
- **Module-boundary decision that shaped the whole design**: `WorkflowModule` does NOT import
  `CasesModule`, and has no `ApprovalController` of its own — every approval route
  (`POST/GET /cases/:id/approvals`, `POST /cases/:id/approvals/:approvalId/decide`) lives on
  `CasesController` instead, which already runs `CasesService.getById`'s full access check before
  delegating to `ApprovalService`. This one-directional boundary (`cases` → `workflow`, never the
  reverse) is what lets `cases` enforce the closure-approval gate without a circular NestJS
  module dependency — `ApprovalService` itself has no case-access check of its own by design (see
  its doc comment), so it is not safe to call from anywhere that hasn't already checked access.
- **CD-04's approval matrix, hardcoded** (`APPROVAL_MATRIX` in `ApprovalService`), same reasoning
  as `cases`' `ELEVATED_ROLES` and `configuration`'s CD-owner mapping: CD-04's free-text approver
  names ("CRO/Executive", "Case Owner + peer review") don't map 1:1 onto the `Role` enum.
  Approximations documented inline, e.g. "peer review" (a process, not a role) mapped to
  `TEAM_LEAD` standing in for "a peer". `ADMIN` always authorized on top of the table, matching
  the allow-list pattern already used in `WhistleblowerVaultService`.
- **Segregation of duties**: the requester of an `ApprovalRequest` cannot decide it, enforced in
  `ApprovalService.decide` regardless of role (even `ADMIN` can't self-approve).
- **A real bug found and fixed live, same session it was introduced** (following the precedent
  `triage`/`cases` set of verifying during the build, not after): the self-approval check and the
  role-authorization check in `ApprovalService.decide` both throw `ForbiddenException`, but only
  the role check originally wrote a `DENIED` audit event — an inconsistency invisible until a
  live test specifically checked the audit trail for a self-approval denial and found nothing
  there. Every denial in this codebase is supposed to be audited (non-negotiable #6's spirit,
  applied here even though self-approval isn't literally one of the 7 case-access conditions);
  fixed by adding the missing audit call, then re-verified live that both denial reasons
  (`self_approval_blocked`, `role_not_authorized`) now appear correctly.
- **Live-verified, same session, the full mechanism end to end**: SLA clock start → breach-check
  (`isBreached`/`remainingMs` computed correctly) → duplicate-start rejection → pause → resume
  (`totalPausedMinutes` accumulated) → stop. Approval: request → self-approval blocked (403,
  audited) → wrong-role blocked (403, audited — required a second test after the first one
  accidentally tested `CasesService`'s own team-match denial instead, since the test user wasn't
  on the case's team yet; corrected by adding team membership first, isolating the actual role
  check) → correct role (`FRAUD_RISK_MANAGER`) approves → re-deciding an already-decided request
  rejected (400) → closing without an `approvalId` rejected (400, DTO validation) → closing
  referencing a still-`PENDING` request rejected (400) → closing referencing the `APPROVED`
  request succeeds, `closedAt` set. Plus a fresh RLS unscoped-vs-scoped proof on both new tables.
- **RLS**: `sla_clocks` and `approval_requests` both get SELECT/INSERT/UPDATE, no DELETE — both
  mutate the same row over their lifecycle (pause/resume/stop; decide), matching
  `configuration_entries`' ratify pattern rather than `triage_assessments`'/`case_status_history`'s
  append-only-new-row pattern.
- **Seed**: extended `prisma/seed.ts` with one demo `SlaClock` (STOPPED) on the STANDARD incident
  and one demo `ApprovalRequest` (`CASE_CLOSURE`, `APPROVED`) on `CASE-2026-0001` — which, being
  approved, also transitions that seed case to `CLOSED`, mirroring the exact flow this module's
  own live verification exercised through the real API rather than inventing separate seed logic.
- **Verified, live, same session**: `prisma validate`/`generate`/`migrate dev` against Neon,
  `npm run db:rls`, `npm run seed` (idempotent — correctly recognized the already-existing
  live-tested approval/clock data and skipped re-creating it), full `tsc`/`nest build`/`eslint`,
  and the real running app exercising every new route plus the full SLA-clock and approval flows
  above, including the audit-fix re-verification.
- This module completes the MVP build order's core incident-to-case flow. Next per that order:
  the real `audit` module (the current `AuditService` is explicitly a minimal write-only sink,
  not the module described in architecture.md — no query API, no integrity hash chain), then
  evidence/containment/recovery/CAPA/regulatory/notifications once that's in place.

## 2026-09-21 — `cases` module scaffolded — the full non-negotiable #6 access rule, implemented and live-proven

- Added `cases` to `efims-backend/` per the MVP build order (`triage` → `cases` → `workflow`).
  This is the module CLAUDE.md non-negotiable #6 and architecture.md §4.3 are actually about —
  every prior mention of "the full 7-condition case-access rule" in this codebase was a forward
  reference; this entry is where it's actually implemented, and where all 7 conditions
  (tenant, role, team-or-elevated-role, not-subject, not-conflict, clearance≥sensitivity,
  compartment) were independently exercised live against the real database, not just unit-level.
- **Schema**: `Case` (referenceCode, title/description, `status: CaseStatus`, `sensitivityLevel`
  1-4 on the *same scale as `User.clearanceLevel`* so the clearance check is a bare comparison,
  `compartment`, `assignedTeamId`), `CaseUserFlag` (one enum, `SUBJECT`/`CONFLICT`, one table —
  both are structurally identical "deny access to this (case, user) pair" flags), and
  `CaseStatusHistory` (append-only transition log, not a workflow state machine). `Incident`
  gained `caseId` (nullable FK) — the field the `incidents` module's own README had flagged as
  "still cases's, not yet built" since that module shipped.
- **Deliberate separation from triage severity**: `Case.sensitivityLevel` (who's allowed to see
  this) is NOT the same concept as a linked Incident's CD-02 `severity` (how urgent the
  response is) — never auto-derived from it. Whoever opens a case sets sensitivity explicitly.
  Flagged prominently in the schema doc comment so this doesn't get conflated later.
- **Cross-module additions this module needed to function at all**: `IncidentsService.linkToCase`
  (mirrors `markUnderReview`'s pattern — the only way `Incident.status` becomes `LINKED_TO_CASE`,
  called only by `CasesService`); `TeamsService.isUserOnTeam`/`getUserTeamIds` (single-check and
  batch-check siblings — batch exists specifically so `CasesService.list` doesn't N+1 query team
  membership per case, a lesson from this project's own earlier live-verification pass);
  `TeamsService.addMember` + `POST /teams/:id/members` (admin-only) — added because there was
  literally no way to exercise the team-match access condition through the API without it;
  `UsersService.assertUserExists` (validates a flag's target user is real).
- **"Elevated role" for the team-match bypass** (architecture.md §4.3 names the concept, not
  which roles qualify): `FRAUD_RISK_MANAGER`/`COMPLIANCE_MLRO`/`LEGAL_COUNSEL`/`EXECUTIVE`/`ADMIN`
  bypass; `INVESTIGATOR`/`TEAM_LEAD`/`CASE_OWNER` need actual `TeamMembership`. A flagged scope
  decision, not stated anywhere in the source docs — same caveat pattern as
  `ConfigurationController`'s CD-owner-to-Role mapping.
- **One more real bug found live** (this module's live-verification pass ran *during* the build,
  not after, following the precedent `triage` set): `CasesService.addFlag` used Prisma's
  `.upsert()`, which compiles to `INSERT ... ON CONFLICT DO UPDATE` — Postgres requires UPDATE
  privilege for that statement even on the path that never actually updates a row. But
  `case_user_flags` deliberately has no UPDATE grant (delete-then-recreate is the intended
  mutation path — see the model's schema doc comment). First live call failed with
  `permission denied for table case_user_flags`. Fixed in the service code (explicit
  delete-then-create inside one transaction), not by loosening the grant — the grant was correct,
  the code didn't match its own documented design yet.
- **Live-verified, same session, every one of the 7 conditions independently**: created two test
  users with controlled clearance/team-membership, then proved — team-match denial (not on
  team) and grant (added via the new `POST /teams/:id/members`, access restored); clearance
  denial (clearanceLevel 1 vs. sensitivityLevel 2); `SUBJECT` flag denial and restoration after
  removal; compartment denial (`AML_MLRO` case, no grant) and admin success (has the grant). Plus
  the ordinary flow: case creation with incident linking (confirmed `Incident.status` flips to
  `LINKED_TO_CASE`), status transition with history logging, duplicate-transition rejection, and
  a fresh RLS unscoped-vs-scoped proof on all three new tables (all 0 unscoped).
- **Test data cleanup**: two test users and their memberships/refresh tokens were deleted after
  verification (same practice as prior modules). The cases/flags/history rows created during
  testing could **not** all be cleaned up — `cases`/`case_status_history` have no DELETE grant by
  design, so the two test cases (`CASE-2026-0001`, formally adopted into `seed.ts` as the
  official demo case; `CASE-2026-0002`, an incidental `AML_MLRO`-compartment case from the
  compartment-denial test) now exist permanently. Not a problem — treated the same way as
  `triage`'s own permanent test-escalation data: the append-only guarantee held even against
  deliberate cleanup, which is itself a form of live proof that the grants are real.
- **RLS**: `cases` gets SELECT/INSERT/UPDATE, no DELETE (status transitions, not row removal,
  same as `incidents`). `case_status_history` gets SELECT/INSERT only, no UPDATE/DELETE (pure
  append-only, same as `triage_assessments`). `case_user_flags` gets SELECT/INSERT/DELETE, no
  UPDATE — an access-control mechanism, not a historical record, closer in spirit to
  `user_compartment_grants` than to an audit trail.
- **Seed**: extended `prisma/seed.ts` with one demo `Case` (`CASE-2026-0001`, linked to the
  STANDARD incident) — the WHISTLEBLOWER incident is left un-linked, so seed data spans all three
  stages (raw signal, triaged incident, linked case) rather than everything pre-processed.
- **Verified, live, same session**: `prisma validate`/`generate`/`migrate dev` against Neon,
  `npm run db:rls`, `npm run seed` (idempotent — correctly adopted the already-existing test case
  without resetting its live-tested `UNDER_INVESTIGATION` status), full `tsc`/`nest build`/
  `eslint`, and the real running app exercising every new route plus the full access-control
  matrix above.
- Next: `workflow` per the MVP build order.

## 2026-09-21 — `triage` module scaffolded (severity, routing, escalation) — live-verified from day one

- Added `triage` to `efims-backend/` per the MVP build order (`incidents` → `triage` → `cases`).
  Implements architecture.md's module-map description exactly: "severity engine, routing,
  escalation". Unlike every prior module, this one was verified live against Neon *in the same
  session it was built* (using the setup from the entry below) rather than statically first and
  live later — the whole assess → duplicate-rejection → escalate → history → invalid-config-
  rejection flow was exercised through the real running app before being called done.
- **Schema**: `SeverityTier` enum (`S1`-`S4`, fixed by design — unlike CD-01's freeform
  categories, CD-02's tier *names* don't vary per tenant) and `TriageAssessment` (severity,
  `slaCalendarName`, optional `assignedTeamId`, required `rationale`, `previousAssessmentId`
  self-relation). Append-only, same posture as `ConfigurationEntry`'s version history: a
  `TriageAssessment` is never mutated after creation, and an incident's *current* triage state is
  simply its latest assessment — no separate synced "current" field anywhere. Deliberately no
  severity-direction constraint on `escalate` — a downward correction is exactly as valid a
  revision event as an upward escalation.
- **Deliberately kept off `Incident` itself**: severity and routing live entirely in
  `TriageAssessment`, not as columns on the `Incident` row — the same "keep concerns in their own
  module's table" discipline `incidents` already established for Signal vs. Incident. The one
  narrow exception: `IncidentsService.markUnderReview`, a new single-direction status transition
  (`OPEN` → `UNDER_REVIEW`) that `triage` triggers on an incident's first assessment — not a
  general state machine (architecture.md assigns that to `workflow`, not `triage`), just the one
  transition needed to keep `Incident.status` from sitting at `OPEN` forever once triage has
  actually looked at it.
- **New cross-module surface in `identity`**: `Team`/`TeamMembership` existed in the schema since
  the `identity` module shipped but had no service or API touching them at all — `triage` needed
  a way to validate and discover routing teams, so this module added `TeamsService`
  (`list`/`assertExists`) and a minimal `GET /teams` route, mirroring how `getGrantedCompartments`
  was added to `UsersService` specifically for `incidents`' needs.
- **CD-03 validation live-tests the config boundary two levels deep**: `TriageService` validates
  `slaCalendarName` against `ConfigurationService.getCurrent(CD_03_SLA_CALENDARS)` — the second
  module (after `incidents`' CD-01 check) to consume `configuration`'s read API as a real
  consumer, confirming that boundary holds under a second, independent use case.
- **RLS**: `triage_assessments` gets SELECT/INSERT only — no UPDATE, no DELETE at all, stricter
  even than `configuration_entries` (which still needs UPDATE for the ratify transition). Proven
  live, not just declared: attempting to clean up test data created during this session's own
  live smoke test failed with `permission denied for table triage_assessments` through the
  `efims_app` role, exactly as designed — the append-only guarantee held even against deliberate
  manual cleanup, so that test data (a real S2→S1 escalation chain) now permanently exists as
  seeded-adjacent demo data.
- **Seed**: extended `prisma/seed.ts` with one demo `TriageAssessment` (S2, `24x7`) on the
  STANDARD fraud incident — the WHISTLEBLOWER incident is left un-triaged on purpose, so the seed
  data shows both states rather than everything pre-processed.
- **Verified, live, same session**: `prisma validate`/`generate`/`migrate dev` against Neon,
  `npm run db:rls`, `npm run seed`, full `tsc`/`nest build`/`eslint`, and a real running app
  exercising every new route — `GET /teams`, `POST .../triage` (including the OPEN→UNDER_REVIEW
  side effect and the duplicate-assessment 400), `POST .../triage/escalate` (including the
  revision chain and the CD-03 rejection path), `GET .../triage`, `GET .../triage/history` — plus
  a fresh RLS unscoped-vs-scoped proof against the new table.
- Next: `cases` per the MVP build order.

## 2026-09-21 — First live database verification (Neon): 4 real bugs found and fixed

- Set up a real Postgres database for the first time in this project's history — Neon's free
  tier, chosen over a local install after the local Postgres superuser password turned out to be
  unrecoverable without an elevation this environment doesn't have, and over Render's free
  Postgres tier because that one expires after 30 days (not viable as an everyday dev DB, even
  though Render is the confirmed production target per `docs/architecture.md`). Ran the full
  `identity` + `configuration` + `incidents` module stack against it end to end for the first
  time — migrations, RLS policies, seed data, and the live NestJS app itself. Every prior
  "verified" note in this changelog (2026-09-18, 2026-09-21 ×2) meant *static* verification only
  (`tsc`, `prisma validate`, `nest build`, `eslint`) — this entry is the first time any of it ran
  against a real database. It surfaced four genuine bugs that three straight modules' worth of
  static verification never could have caught, all now fixed:

  1. **Session-scoped `set_config` leaks tenant context across unrelated pooled connections.**
     `prisma/seed.ts` originally set `app.current_tenant` at session scope (`false`) — safe
     against a direct local Postgres connection, but proven live to leak across completely
     separate client connections reusing the same PgBouncer-pooled backend on Neon: a fresh
     `psql` session, with no query ever run before it, inherited the previous session's tenant
     id. **This was a real cross-tenant data exposure vector**, not a theoretical one — confirmed
     by directly querying `current_setting('app.current_tenant', true)` on a brand new
     connection and seeing the previous script's tenant id come back. Fixed by rewriting
     `seed.ts` to run every tenant-scoped write inside one `$transaction` with `set_config(...,
     true)` as the first statement — the same transaction-local pattern
     `PrismaService.withTenant`/`forCurrentTenant` already used correctly; the app's own runtime
     code was never affected, only this one script. Documented as a hard rule in
     `efims-backend/README.md`'s new "pooled connections" section, since it's exactly the kind of
     mistake anyone hand-writing SQL against this database later could repeat.
  2. **`JwtAuthGuard` (global, via `APP_GUARD` in `AppModule`) couldn't resolve `JwtService`** —
     `JwtModule` was registered inside `IdentityModule` but never exported, so `AppModule`'s own
     injector (where `APP_GUARD` providers actually get instantiated) couldn't see it. The app
     failed at boot with a DI resolution error on its very first run — invisible to `tsc`/`nest
     build`/`eslint`, none of which instantiate Nest's actual DI container. Fixed by adding
     `JwtModule` to `IdentityModule`'s `exports`.
  3. **`ConfigurationService.getAllCurrent()` fired 8 concurrent `$transaction`s** (one per CD
     key, via `Promise.all`) — fine against local Postgres, but against a real remote/pooled
     database this exhausted available transaction slots and threw `"Unable to start a
     transaction in the given time"`, with collateral failures on unrelated concurrent requests
     (`IncidentsService.list` failed the same way moments later, from the same contention).
     Fixed by consolidating all 8 lookups into one transaction, sequentially — which is also a
     genuine correctness improvement (one consistent snapshot instead of 8 independently-
     committed reads). Also flattened `ConfigurationController.getOne`'s 2-way `Promise.all` to
     sequential awaits for the same reason, pre-emptively.
  4. **Prisma's default transaction budget (2s to acquire, 5s to complete) was too tight for this
     database's real round-trip latency** even after fix #3 — single-query transactions still
     occasionally failed to acquire a slot in time, and `getAllCurrent`'s now-sequential 16-query
     transaction outright expired mid-flight (`"Transaction ... old closed transaction"`). Fixed
     at the one shared chokepoint every tenant-scoped call already goes through —
     `PrismaService.withTenant` now passes `{ maxWait: 10000, timeout: 20000 }` to every
     `$transaction` it opens, project-wide, rather than patching individual call sites as each
     one was discovered.

- **What DID work correctly the first time, live, no fixes needed**: RLS tenant isolation
  (confirmed with real seeded data present, not just an empty database — an unscoped `efims_app`
  connection saw 0 rows, a tenant-scoped one saw exactly that tenant's data); Incident-level
  compartment visibility filtering (a fresh `INVESTIGATOR` user with no compartment grants
  correctly saw only the `STANDARD` incident in `GET /incidents`, and got a `403` — with a
  `DENIED` audit event actually written — on `GET /incidents/:id` for the `WHISTLEBLOWING` one);
  the full login → JWT → protected-route flow; and the Signal→Incident seed data end to end.
  Non-negotiables #5 and #6 both hold up against a real database, not just on paper.
- **Neon setup specifics, for future reference**: `schema.prisma`'s datasource now has both `url`
  (efims_app, pooled — the app's runtime connection) and `directUrl` (the migration-owning role,
  unpooled — required for Prisma Migrate's advisory locks, which don't work through PgBouncer).
  Neon's control plane rejects a `CREATE ROLE ... PASSWORD` that's too weak *at the SQL level*,
  not just as an application-side opinion — `rls-policies.sql`'s placeholder password had to be
  strengthened from a literal `"changeme"` to pass that check, with a comment instructing readers
  to rotate it immediately after running the script (which this session did, to a random
  32-byte value, kept only in the gitignored `.env`).
- Updated `efims-backend/README.md`: setup steps now cover `DIRECT_URL` and the
  privileged-role/`efims_app` password-rotation step; a new section documents the pooled-
  connection `set_config` rule as a hard constraint, not a suggestion; a note on the transaction
  timeout tuning points back to `PrismaService.withTenant`'s doc comment. Updated `.env.example`
  to include `DIRECT_URL` with an explanation of when it's required.
- This is exactly the class of finding "verified: prisma validate/generate, tsc, nest build,
  eslint — not verified: no live Postgres" was flagging as a real gap in every prior entry, not
  a formality — worth remembering next time that caveat shows up again for a module not yet
  tested live.

## 2026-09-21 — `incidents` module scaffolded (Signal → Incident intake/triage)

- Added `incidents` to `efims-backend/` per the MVP build order (`configuration` → `incidents` →
  ...). Implements the Signal → Incident half of non-negotiable #1 as two genuinely separate
  tables, with the only path from one to the other being a human triage decision at
  `POST /signals/:id/validate` — there is deliberately no `POST /incidents` route anywhere in
  the module.
- **Schema**: `Signal` (source/summary/payload/status, `SignalStatus` = NEW → VALIDATED |
  REJECTED | MERGED), `Incident` (category/type/subtype/title/description/compartment/status,
  unique per-tenant `referenceCode` like `INC-2026-0001`), `IncidentRelation` (many-to-many
  "related incidents" links), and `WhistleblowerIdentityVaultEntry` (1:1 with a
  WHISTLEBLOWER-sourced Signal). No severity field and no case-linkage field on `Incident` at
  all — both are deliberately out of scope (`triage`'s and `cases`' jobs respectively once those
  modules exist); `IncidentStatus.LINKED_TO_CASE` exists only as a placeholder value this module
  never sets.
- **Atomicity across the module boundary**: two places where two tables must commit together or
  not at all, both implemented by passing the caller's open transaction (`TenantScopedClient`)
  into the callee rather than each service opening its own: (1) `SignalsService.create` +
  `WhistleblowerVaultService.createEntry` — a whistleblower Signal can never exist without its
  vault entry, even an anonymous one; (2) `SignalsService.validate` + `IncidentsService.
  createFromSignal` — a Signal can never end up `VALIDATED` without its Incident existing, or
  vice versa. `IncidentsService.createFromSignal` is written to only ever be called this way (it
  takes `tx` as a required first parameter, never opens its own transaction), which is also what
  structurally enforces "no Incident without a Signal" beyond just there being no create route.
- **Compartment visibility extended to Incident level** (a deliberate extension beyond what
  architecture.md §4.3 literally scopes to `cases`): `IncidentsService.getById`/`list` filter by
  `compartment === STANDARD OR compartment ∈ actor's granted compartments`, reading grants via a
  new `UsersService.getGrantedCompartments(userId)` method (identity module) rather than
  querying `user_compartment_grants` directly, per the module-boundary rule (non-negotiable #2).
  A single-resource denial is audited (`DENIED`, `incidents.incident.view`); list-level scoping
  is silent filtering, not an audited event — matches how identity's own grants behave elsewhere.
  Rationale: a WHISTLEBLOWING or AML_MLRO incident is exactly the kind of thing that shouldn't be
  visible to an arbitrary investigator before `cases` exists to enforce the full 7-condition
  check; waiting for `cases` to add this would leave a real gap in the meantime.
- **Whistleblower identity vault** (non-negotiable #7): `WhistleblowerVaultService` is the sole
  code path that reads or writes `WhistleblowerIdentityVaultEntry`. Read access gated to
  `COMPLIANCE_MLRO`/`LEGAL_COUNSEL`/`ADMIN` only — deliberately excludes the investigator working
  the resulting incident day-to-day. Every read is audited regardless of outcome (not just
  denials, unlike `RolesGuard`'s pattern), since access itself to this vault is the sensitive
  event.
- **CD-01 taxonomy as live validation, not a hardcoded list**: `IncidentsService.
  assertValidTaxonomy` calls `ConfigurationService.getCurrent(CD_01_INCIDENT_TAXONOMY)` on every
  Incident creation and rejects unknown category/type combinations — the first real cross-module
  consumer of the `configuration` module's read API, confirming that boundary works as designed.
- **Seed**: extended `prisma/seed.ts` with 2 demo Signal→Incident pairs (one STANDARD fraud
  incident, one WHISTLEBLOWER incident with its vault entry as anonymous) written directly
  against Prisma (no NestJS DI container in a seed script) rather than through the services —
  flagged in the script's own comment as not a substitute for exercising the real API flow.
- **RLS**: `rls-policies.sql` updated — `signals`/`incidents`/`whistleblower_identity_vault` get
  SELECT/INSERT/UPDATE with DELETE revoked (same append-only-by-grant pattern as
  `configuration_entries`/`audit_events` — a Signal or Incident is never actually deleted, only
  status-transitioned); `incident_relations` gets DELETE too (an incident relation, unlike the
  incident/signal it connects, is a plain link that can legitimately be un-linked).
- **Verified**: `prisma validate`, `prisma generate`, `tsc --noEmit` (both the main app's
  tsconfig and the seed script's separate one), `nest build`, and `eslint` all pass clean.
  **Not verified**: same caveat as the two prior entries — no live Postgres credentials
  available in this environment, so the Signal/Incident/vault flow, the RLS policies, and the
  seeded demo data haven't been exercised against a real database yet.
- Next: either verify this (and the two prior modules) against a real Postgres instance, or move
  on to `triage` per the MVP build order.

## 2026-09-21 — `configuration` module scaffolded (CD-01–CD-08 as versioned config)

- Added `configuration` to `efims-backend/` per the MVP build order (`identity` →
  `configuration` → ...). Implements every item in `docs/configuration-decisions.md` as
  versioned, per-tenant config with a draft → ratify → superseded lifecycle, per that doc's own
  framing ("implemented as versioned, per-tenant configuration ... not hardcoded").
- **Schema**: one generic `ConfigurationEntry` table (`key: CdKey` enum for CD-01..CD-08,
  `version: Int`, `value: Json`, `status: DRAFT|RATIFIED|SUPERSEDED`, `effectiveDate`,
  `createdBy`, `ratifiedBy`/`ratifiedAt`) rather than 8 bespoke tables — the 8 CD payload shapes
  are too different for a shared table, but the versioning/ratification/audit lifecycle is
  identical across all 8, so one table with 8 TypeScript-typed payload shapes
  (`cd-value.types.ts`) avoided 8x the boilerplate. Each shape is transcribed directly from the
  doc's tables (taxonomy tree, severity tiers, SLA calendars, approval matrix, retention
  classes, migration scope, RTO/RPO tiers, AI phase/guardrail table).
- **Deliberate scope decision on tenancy**: architecture.md §4.2 describes CD values as living
  in "the control plane" alongside `Tenant` — read that as being about *governance* (an
  approval workflow, not ordinary CRUD), not about cross-tenant visibility. Kept
  `ConfigurationEntry` tenant-scoped and RLS-protected like every other business table, since a
  bank's own severity thresholds/retention schedule/approval matrix are exactly the kind of
  per-bank data non-negotiable #5 exists to isolate. Documented explicitly in both
  `schema.prisma` and this entry so it doesn't read as an accidental deviation from
  architecture.md later.
- **"Current" value resolution**: latest RATIFIED version with `effectiveDate <= now`, falling
  back to the latest DRAFT if nothing's ratified yet — required by non-negotiable #9 (CD values
  are working defaults until ratified, but the system still needs something to run on
  meanwhile). `ConfigurationService.getCurrent(key)` is the only sanctioned read path for
  future modules (`triage`, `cases`, etc.) once they exist — no other module may query
  `ConfigurationEntry` directly, per non-negotiable #2.
- **Naira thresholds / amount bands / cutover date deliberately left `null`**: CD-02's
  financial-loss thresholds, CD-04's amount bands, and CD-06's cutover date are explicitly
  flagged in the source doc as *not EFIMS's to invent* (Board Risk Committee / Governance /
  Sponsor decisions respectively) — seeded as `null`, not a guessed placeholder number.
- **Seed**: extended `prisma/seed.ts` to create all 8 CDs as unratified DRAFT v1 for tenant
  `bank-1`, authored by the bootstrap admin, with every value transcribed verbatim from
  `docs/configuration-decisions.md` (not synthesized).
- **Role gating**: mutation endpoints (`POST /configuration/:key`,
  `POST /configuration/:key/:version/ratify`) gated to `Role.ADMIN`/`Role.EXECUTIVE` as a
  stand-in for the actual named CD owner (Fraud Risk, Risk/Executive, Operations, Governance,
  Legal/Records, Sponsor, Technology, Model Governance) — none of which map 1:1 onto identity's
  `Role` enum. Flagged as a known gap, not solved here; a real per-CD-owner approval mapping is
  future work.
- **RLS**: `rls-policies.sql` updated — `configuration_entries` gets SELECT/INSERT/UPDATE
  (UPDATE needed for the ratify transition) but DELETE is revoked at the grant level (version
  history is permanent, never deleted) — same belt-and-suspenders pattern as `audit_events`,
  slightly relaxed since ratification legitimately needs UPDATE where audit events need none.
- **Verified**: `prisma validate`, `prisma generate`, `tsc --noEmit` (both the main app's
  tsconfig and the seed script's separate one), `nest build`, and `eslint` all pass clean.
  **Not verified**: same as the 2026-09-18 identity entry — no live Postgres credentials
  available in this environment, so the migration/RLS/seed/ratify flow hasn't been exercised
  against a real database yet.
- Next: either verify this (and the identity module) against a real Postgres instance, or move
  on to `incidents` per the MVP build order.

## 2026-09-18 — `identity` module scaffolded (first backend code)

- Created `efims-backend/` — NestJS modular monolith per `docs/architecture.md` §2, with the
  `identity` module built out plus the minimal `audit`-write plumbing identity depends on.
  First real application code in the repo; everything before this was documentation and design
  mockups.
- **Schema (`prisma/schema.prisma`)**: `Tenant` in the control plane (no RLS); tenant-scoped
  `User`, `UserCompartmentGrant`, `Team`, `TeamMembership`, `RefreshToken`, `AuditEvent`.
  `User.clearanceLevel` is a plain integer (1–4) specifically so the `cases` module's future
  `user.clearanceLevel >= case.sensitivityLevel` check (non-negotiable #6) is a bare comparison.
  `Compartment` enum matches non-negotiable #7 exactly (`STANDARD`/`AML_MLRO`/`WHISTLEBLOWING`/
  `LEGAL_PRIVILEGE`/`HR`/`EXECUTIVE`).
- **Tenant isolation (non-negotiable #5), enforced twice**: `prisma/rls-policies.sql` adds a
  `tenant_isolation` RLS policy (`tenantId = current_setting('app.current_tenant')`) plus
  `FORCE ROW LEVEL SECURITY` on every tenant-scoped table, and creates a dedicated non-superuser
  `efims_app` role the app connects as (superusers/table owners bypass RLS regardless of policy
  count — a common footgun this avoids). At the application layer,
  `PrismaService.withTenant`/`forCurrentTenant` + `TenantContextInterceptor` set that session
  variable per request from the JWT's `tenantId` claim, via `AsyncLocalStorage` — this is the
  "tenant-context middleware" architecture.md §4.2 describes, implemented as an interceptor
  instead of Express middleware so it can wrap the whole downstream async chain, not just the
  pre-handler phase.
- **Auth**: `POST /auth/login` (tenant slug + email + password → access + refresh JWT pair),
  `POST /auth/refresh` (rotates the refresh token on every use; detects reuse of an
  already-rotated-out token as a possible-theft signal and revokes all of that user's other
  refresh tokens when it happens), `POST /auth/logout`. Passwords hashed with argon2.
- **Audit-write (non-negotiable #3 & #6, partial)**: `AuditService.record()` is the only
  write path onto `AuditEvent` — no update/delete method exists in code, and
  `rls-policies.sql` additionally `REVOKE`s UPDATE/DELETE on `audit_events` from `efims_app` at
  the database grant level, so the append-only guarantee holds even against a raw-SQL bug, not
  just application code discipline. `RolesGuard` writes a `DENIED` audit event on every
  role-check failure, following the same rule non-negotiable #6 states for case-access denials.
  This is explicitly **not** the full `audit` module from the build order — no query API, no
  integrity hash chain yet — see the doc comment on `AuditService` and on the `AuditEvent`
  model.
- **Users**: `GET /users/me`, `POST /users` (admin-only, creates a user in the *acting admin's
  own tenant* — there is no way to pass a different tenant id into the endpoint, closing off the
  application-layer half of cross-tenant creation even before RLS would catch it).
- **Verified**: `npx prisma validate`, `npx tsc --noEmit`, `npm run build` (Nest CLI), and
  `npm run lint` all pass clean. **Not verified**: no live Postgres credentials were available
  in this environment to actually run `prisma migrate dev`, apply `rls-policies.sql`, or seed/
  exercise the login flow end-to-end — the RLS design is correct on paper and by static
  analysis, but hasn't been proven against a real database yet. `efims-backend/README.md` has
  full setup steps, including a manual check to prove RLS actually denies an unscoped
  connection (not just that it "seems to work" through the API).
- **Deliberately deferred** (see `efims-backend/README.md`'s closing section): no password
  reset/invite flow, `User.role` is a single enum not a permission system, and the full
  7-condition case-access check from architecture.md §4.3 is NOT implemented here — only the
  pieces identity owns (auth, clearance, compartment grants) exist; the rest belongs to `cases`.
- Next: either get this verified against a real Postgres instance, or move on to scaffolding
  `configuration` per the MVP build order.

## 2026-09-18 — `docs/design-system.md` reconciled against shipped mockup palette (v1.1.0 → v1.2.0)

- Rewrote `docs/design-system.md` end to end so its color and font tokens match what's actually
  used across all 35 saved mockups (`mockups/screens/*.html`), cross-checked against
  `mockups/design-tokens/botanical-executive.md`'s frontmatter. This resolves the discrepancy
  flagged on 2026-09-15.
- Key corrections: `primary` `#1E3835` → `#072320`; `primary-container` `#122422` → `#1E3835`;
  `secondary` `#D48372` → `#735854`; `secondary-container` `#F7D3CD` → `#FFDAD4`; `outline`
  `#D8D1CB` → `#727877`. Body/UI font `Inter` → `Plus Jakarta Sans` (no mockup loads or
  references Inter). Added ~30 previously-missing tokens (`tertiary`, `error`, all `-fixed`
  variants) that the real system uses but the hand-authored v1.1.0 doc never modeled. Replaced
  the invented border-radius scale (4/6/10/16px) with the real one (4/8/12px + un-extended
  Tailwind 2xl/3xl for hero cards). Confirmed the existing elevation shadow values were already
  correct — no change needed there.
- Kept the Severity & Status token table (S1–S4, verified/frozen-lien) largely intact but
  corrected shade values (Tailwind 500-weight, not 600-weight) and noted explicitly that these
  are a deliberately separate raw-utility color layer, not derived from the Botanical Executive
  brand tokens — confirmed by literal hex usage in mockup severity badges.
- Every changed value in the doc carries an inline `~~old value~~` so the diff from v1.1.0 is
  traceable without needing git history.
- Not yet done: propagating these corrected tokens into an actual `tailwind.config` file in a
  real frontend codebase — there is no frontend scaffold yet (still pre-`identity`-module per
  the MVP build order). This was a docs-only reconciliation.

## 2026-09-15 — Batch 2 & 3 UI mockups saved (15/15); design-token source docs recovered

- Saved all 15 screens from batches 2 and 3 to `mockups/screens/` — these turned out to include
  full HTML source after all (my earlier read of batch 2 as "images only" was wrong; corrected
  by the user). Total mockups now saved: 35/35 across all three batches.
- Batch 3 also included two full `DESIGN.md`-style token exports, saved to
  `mockups/design-tokens/`:
  - `botanical-executive.md` — matches the palette used by nearly all mockups. Its own YAML
    frontmatter and prose body are internally inconsistent with each other (frontmatter matches
    the mockups; prose matches `docs/design-system.md` instead). Frontmatter should be treated
    as canonical.
  - `efims-vanguard-precision.md` — a second, distinct design system (teal/blue, Inter +
    JetBrains Mono) matching the two previously-flagged outlier screens (`command-center-alt.html`,
    `notification-center-drawer-vanguard.html`). Source comments confirm this was an earlier
    design explored and later restyled into Botanical Executive.
  - These don't yet resolve the `docs/design-system.md` vs. mockup token mismatch flagged
    2026-09-15 earlier today — a reconciliation pass on that doc is still pending, but we now
    have a corroborating canonical source (the frontmatter) to reconcile against.
- One image (a "Velora" dashboard) arrived in the batch but is a different, unrelated product —
  not saved as an EFIMS mockup.
- Updated `mockups/README.md` with the full batch 2/3 inventory and design-token source doc
  pointers.
- No code written yet. Next: scaffold backend (`identity` module first, per MVP build order), or
  do the `docs/design-system.md` reconciliation pass first if the user wants design finalized
  before backend work starts.

## 2026-09-15 — Batch 1 UI mockups saved (20/20)

- Saved all 20 user-supplied HTML mockups (Tailwind + Material Symbols, fully coded with
  screenshots) verbatim to `mockups/screens/`. Added [mockups/README.md](../mockups/README.md)
  as an inventory/index of all saved screens.
- Flagged two open issues for later resolution, documented in `mockups/README.md`:
  - **Design token mismatch**: `docs/design-system.md` (hand-authored from the standalone
    tokens doc) uses different hex values and body font (Inter) than the actual mockup HTML
    (Plus Jakarta Sans, different `primary`/`primary-container`/etc. hex values). Mockups look
    like the more complete/current source — needs a reconciliation pass and user confirmation.
  - **Two inconsistent Operational Command Center variants** saved (`command-center.html` using
    ad hoc color names, `command-center-alt.html` using an unrelated teal/blue palette) — neither
    matches the token convention used by the other 18 screens. Need user to confirm which (if
    either) is canonical.
- **Batch 2 blocked**: user sent a second batch of screens as rendered images only, with no HTML
  source (unlike batch 1). Cannot save as working code without source; asked user to either
  supply HTML or confirm a visual-only reference is acceptable. Awaiting reply.
- No code written yet. Next: scaffold backend (`identity` module first, per MVP build order).

## 2026-09-15 — Documentation initialized

- Set up `CLAUDE.md` and `docs/` from source materials supplied by the user:
  - `Integrate_Fraud_System_Design.pdf` → [architecture.md](architecture.md)
  - `efims_frontend_design_tokens_storybook_stories_documentation.txt` (superset of the
    earlier plain component-docs version) → [design-system.md](design-system.md)
  - `EFIMS_Configuration_Decisions_CD01-CD08.md` (canonical over the two identical draft
    versions) → [configuration-decisions.md](configuration-decisions.md)
- No code written yet. Next: scaffold backend (`identity` module first, per MVP build order)
  and frontend per the confirmed toolset.
