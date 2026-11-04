# EFIMS — Configuration Decisions Register (CD-01 to CD-08)

### Working defaults, per BRD Appendix P

> **Status: working defaults for build purposes — not yet formally ratified.**
> Final sign-off rests with the owning function named under each item, per BRD Section 46 /
> Appendix P and Appendix M (Go-Live Readiness Checklist item: *"Taxonomy, severity, SLA,
> closure and amount definitions signed"*). Do not represent any value below externally (to a
> bank, regulator, or stakeholder) as final until that owner has signed off.
>
> Source: `EFIMS_Configuration_Decisions_CD01-CD08.md` (the cleaned working-defaults version).
> Two earlier drafts (`EFIMS_CD-01_to_CD-08_Draft_Proposals.md` /
> `(1).md`) carry the same proposals with fuller rationale/open-points framing — see those if
> you need the "why" behind a specific number, otherwise this file is canonical.

Every one of these is implemented as **versioned, per-tenant configuration**
(`configuration` module / `TenantConfiguration` in the control plane — see
[architecture.md §4.2](architecture.md#42-multi-tenancy--row-level-security)), not
hardcoded — so actual go-live values can differ per bank and change over time without a code
release.

---

## CD-01 — Incident Taxonomy
**Owner: Fraud Risk**

Three-level hierarchy — **Category → Type → Sub-type**:

| Category | Representative Types |
|---|---|
| Fraud | Card fraud, Internet/mobile banking fraud, ATM/POS fraud, Cheque fraud, Identity theft/impersonation, Internal (staff-perpetrated) fraud, Loan/credit fraud, Third-party/vendor fraud |
| Operational Incident | Process failure, System outage/availability, Reconciliation break, Third-party/vendor failure, Data quality incident |
| Cyber/Information Security | Unauthorized access, Malware/ransomware, DDoS, Data breach/exfiltration, Phishing/social engineering (customer or staff-targeted) |
| Employee Misconduct | Policy violation, Conflict of interest, Harassment/conduct, Unauthorized disclosure, Insider dealing |
| Whistleblowing | Its own compartment (`WHISTLEBLOWING`) regardless of the underlying subject matter it reports on |
| Customer Complaint / Unusual Occurrence | Disputed transaction, Service failure with loss implication, Unusual pattern flagged by staff |

Each Type carries a default severity-scoring profile (CD-02) and default routing team.
Sub-types are left open for population against the bank's actual product set.

---

## CD-02 — Severity Thresholds (S1–S4)
**Owner: Risk / Executive**

A case is scored at the *highest* tier any single criterion triggers:

| Tier | Financial loss | Customer impact | Regulatory trigger | Containment urgency |
|---|---|---|---|---|
| **S1 – Critical** | Above institution-defined "material loss" line | Multiple customers / systemic | Mandatory immediate regulator notification | Immediate, 24×7 |
| **S2 – High** | Mid-band | Single major customer or several customers | Regulatory reporting required within standard statutory window | Same business day |
| **S3 – Medium** | Lower band | Limited, single customer | No immediate regulatory trigger; may require internal reporting | Within SLA, business hours acceptable |
| **S4 – Low** | Near-miss / no realized loss | None or negligible | None | Standard queue |

Actual Naira thresholds separating S1/S2/S3 are set from the institution's risk appetite
statement — **not invented here**, this is a board-risk-committee decision.

> Maps directly to the `severity-s1-critical` … `severity-s4-low` design tokens in
> [design-system.md §1.1](design-system.md#core-color-palette).

---

## CD-03 — SLA Calendars
**Owner: Operations**

- **24×7 calendar** — containment-critical incident types (fraud, cyber, whistleblowing
  intake and initial triage), and any case currently at S1/S2 severity regardless of type.
- **Business-hours calendar** — misconduct investigations, CAPA follow-up, routine case
  administration, S3/S4 items.

Statutory/regulatory deadlines are never paused by either calendar. Any SLA pause requires a
logged reason and approval.

---

## CD-04 — Approval Matrix
**Owner: Governance**

Dimensions: **amount** × **severity** × **action type**.

| Action | S1/S2 | S3/S4 |
|---|---|---|
| Containment action | Team Lead + Fraud Risk Manager | Team Lead |
| Loss write-off | CRO/Executive sign-off | Fraud Risk Manager |
| Regulatory submission | Compliance/MLRO + Legal | Compliance/MLRO |
| Case closure | Fraud Risk Manager | Case Owner + peer review |

Actual amount bands and whether Board Risk Committee has a seat at S1 write-offs are set by
Governance.

---

## CD-05 — Retention Schedule
**Owner: Legal/Records**

| Record class | Proposed retention | Note |
|---|---|---|
| AML/MLRO (STR/SAR-linked) case records | Minimum statutory AML retention period (commonly 5+ years post-relationship or post-closure under FATF-aligned regimes) | Cannot be shortened by config |
| General fraud/incident case records | Case closure + configurable years (e.g. 7 years) | Aligned to general banking records practice |
| Whistleblower identity records | Separate, stricter retention/access policy — identity vault kept isolated from case content | Joint Legal/DPO sign-off |
| HR disciplinary records | Per labour law + HR policy — separate clock from the case record | HR/Legal |
| Evidence objects | Matches the linked case's retention class, with legal-hold override that suspends any disposal job | Never auto-deleted under active hold |

**Needs formal Legal/Records validation against NDPA and applicable CBN/AML retention
circulars before being treated as final.**

---

## CD-06 — Historical Migration Scope
**Owner: Sponsor**

- **In scope:** all currently open/active cases across legacy registers; closed cases still
  within their retention window; open CAPAs; unresolved recoveries; anything under legal hold
  regardless of age.
- **Out of scope by default:** closed cases past retention (unless a specific regulatory
  record must be preserved); fully written-off/reconciled financial items with no open
  obligations.
- Legacy classification values map to the new taxonomy (CD-01) without overwriting the
  original recorded value.

**Open point for Sponsor:** exact cutover date and whether any pre-EFIMS "shadow register"
needs a longer read-only tail.

---

## CD-07 — RTO / RPO
**Owner: Technology**

| Function tier | RTO (target) | RPO (target) |
|---|---|---|
| Intake + containment-critical path | ≤ 4 hours | ≤ 15 minutes |
| Core case/workflow/evidence | ≤ 24 hours | ≤ 1 hour |
| Regulatory reporting | ≤ 24 hours (deadline-aware) | ≤ 1 hour |
| Dashboards/analytics (non-operational) | ≤ 72 hours | ≤ 24 hours |

Sized to be architecturally plausible with the Phase 1 stack (Postgres + S3-compatible
storage + standard backup tooling) — **not a substitute for a real Business Impact
Analysis**, which is required to finalize these.

---

## CD-08 — AI Use-Case Release Scope
**Owner: Model Governance**

| Phase | AI capability released | Guardrail |
|---|---|---|
| Phase 2 | Severity-suggestion, duplicate-detection | Advisory score + confidence + cited factors only; human sets final severity |
| Phase 3 | Narrative/entity extraction from free text | Every extracted fact is source-cited back to the original text |
| Phase 4 | Anomaly/typology detection, recovery-propensity model | Feeds triage/prioritization only — never auto-closes, auto-escalates, or auto-files a regulatory report |
| Phase 5 | Case summarisation / AI assistant | Citations mandatory; UI must warn against treating summaries as authoritative until verified |

No use case in any phase performs an autonomous adverse action (containment, write-off,
disciplinary action, regulatory submission) without a human approval step — this is enforced
architecturally via the `ml-gateway` boundary
(see [architecture.md §1](architecture.md#1-architecture-overview)), not just by policy.

---

## Ratification tracker

Update this table as each owner actually signs off — until every row says `Ratified`, treat
the whole register as provisional.

| Item | Owner | Status |
|---|---|---|
| CD-01 Incident Taxonomy | Fraud Risk | Draft |
| CD-02 Severity Thresholds | Risk / Executive | Draft — Naira thresholds pending |
| CD-03 SLA Calendars | Operations | Draft |
| CD-04 Approval Matrix | Governance | Draft — amount bands pending |
| CD-05 Retention Schedule | Legal/Records | Draft — needs formal NDPA/AML validation |
| CD-06 Historical Migration Scope | Sponsor | Draft — cutover date pending |
| CD-07 RTO / RPO | Technology | Draft — pending BIA |
| CD-08 AI Use-Case Release Scope | Model Governance | Draft |
