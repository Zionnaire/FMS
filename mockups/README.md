# EFIMS Mockups — Screen Inventory

Reference HTML mockups for the EFIMS frontend, supplied by the user as fully-coded Tailwind
prototypes (with rendered screenshots). Saved verbatim to `screens/` for implementation
reference. Each file is self-contained (CDN Tailwind + inline config, Google Fonts, Material
Symbols) and can be opened directly in a browser.

Do not treat these as production code — they're static design reference. Component structure,
copy, and sample data should inform the real Next.js implementation, not be copy-pasted wholesale.

## Batch 1 — saved (20/20)

| File | Screen | Notes |
|---|---|---|
| [login-mfa.html](screens/login-mfa.html) | Login + MFA | |
| [command-center.html](screens/command-center.html) | Operational Command Center ("Good day, Adewale!") | ⚠️ Uses ad hoc Tailwind color names (`spruce-dark`, `blush-accent`, `botanical-bg`, etc.) instead of the Material-token naming (`primary`, `primary-container`) every other screen uses. Needs reconciling before build. |
| [command-center-alt.html](screens/command-center-alt.html) | Operational Command Center (alt) | ⚠️ Different palette entirely — teal/blue Material tokens (`primary #00685f`, `tertiary #0051d5`) vs. the spruce/blush botanical palette used everywhere else. Likely a discarded exploration; confirm with user which command-center variant (if either) is canonical. |
| [incident-queue.html](screens/incident-queue.html) | Incident Queue | |
| [log-incident.html](screens/log-incident.html) | Log Incident (intake form) | |
| [case-queue.html](screens/case-queue.html) | Case Queue | |
| [case-detail-dossier.html](screens/case-detail-dossier.html) | Master Case Detail & Dossier Overview | |
| [customer-360-entity-profile.html](screens/customer-360-entity-profile.html) | Customer 360 / Entity Profile | |
| [network-graph.html](screens/network-graph.html) | Entity/Transaction Network Graph | |
| [evidence-vault.html](screens/evidence-vault.html) | Evidence Vault | |
| [artifact-inspector.html](screens/artifact-inspector.html) | Artifact Inspector | |
| [pnd-console.html](screens/pnd-console.html) | Post-No-Debit (PND) Console | Containment/confirmation-gating UI — see CD non-negotiables in `CLAUDE.md`. |
| [gateway-kill-switch.html](screens/gateway-kill-switch.html) | Gateway Kill Switch | Containment action, confirmation-gated. |
| [rail-latency.html](screens/rail-latency.html) | Payment Rail Latency Telemetry | |
| [system-health-telemetry.html](screens/system-health-telemetry.html) | System Health Telemetry | |
| [loss-recovery-dashboard.html](screens/loss-recovery-dashboard.html) | Loss Recovery Dashboard | |
| [str-form-generator.html](screens/str-form-generator.html) | NFIU STR Form 04-B Generator | Regulatory filing — CBN/NFIU statutory SLA clock UI. |
| [cbn-incident-report.html](screens/cbn-incident-report.html) | CBN Incident Report | Regulatory filing. |
| [executive-threat-briefing.html](screens/executive-threat-briefing.html) | Executive Threat Briefing | Executive compartment view. |
| [whistleblower-portal.html](screens/whistleblower-portal.html) | Whistleblower Portal | WHISTLEBLOWING compartment — likely anonymized/externally-facing. |

(20 filenames listed; `network-graph.html` etc. counted once each — total matches the 20 supplied `code.html` documents.)

## Batch 2 & 3 — saved (15/15)

Contrary to my earlier note below (left here for the record — it was wrong): batches 2 and 3
**did** arrive with full HTML source, same as batch 1. All 15 screens are saved.

| File | Screen | Notes |
|---|---|---|
| [hsm-signing-enclave.html](screens/hsm-signing-enclave.html) | Hardware Key & HSM Cryptographic Signing Enclave | Evidence Vault sub-screen. Quorum-based hardware signing (YubiKey/HSM). |
| [regulatory-compliance-scorecard.html](screens/regulatory-compliance-scorecard.html) | Regulatory Compliance Scorecard & AI Fact-Checking Summary | Executive view; AI-generated narrative with mandatory cited-evidence disclaimer. |
| [regulatory-query-audit-trail.html](screens/regulatory-query-audit-trail.html) | Regulatory Query & Audit Trail | Statutory inquiry ledger + response drafting workspace. |
| [team-assignment-conflict-check.html](screens/team-assignment-conflict-check.html) | Team Assignment & Conflict Check | Case squad allocation + PEP/insider conflict-of-interest screening. |
| [transaction-flow-heatmap.html](screens/transaction-flow-heatmap.html) | Transaction Flow & Anomaly Heatmap Matrix | Investigations sub-screen; 7×24 intensity heatmap + forensic flow table. |
| [incident-triage-severity.html](screens/incident-triage-severity.html) | Incident Triage & Severity Assignment | AI severity advisory (non-binding) + human override/sign-off — good reference for CD-02 severity tiers and the human-approval non-negotiable. |
| [alert-rule-engine.html](screens/alert-rule-engine.html) | Alert Rule Engine & Threshold Tuning | Rules catalog + live threshold sliders + ROC curve simulation. |
| [court-ready-evidence-package.html](screens/court-ready-evidence-package.html) | Court-Ready Evidence Package Generator | Evidence Vault sub-screen; Merkle-sealed judicial export bundle. |
| [duplicate-detection-correlation.html](screens/duplicate-detection-correlation.html) | Duplicate Detection & Correlation Review | Side-by-side incident merge/link/reject workflow. |
| [entity-risk-scoring-watchlist.html](screens/entity-risk-scoring-watchlist.html) | Entity Risk Scoring & Watchlist Screening | Composite risk gauge + multi-list sanctions screening + PEP kinship graph. |
| [notification-center-drawer.html](screens/notification-center-drawer.html) | Global Notification Center Drawer (botanical) | Botanical-palette version — matches the canonical mockup palette. |
| [notification-center-drawer-vanguard.html](screens/notification-center-drawer-vanguard.html) | Global Notification Center Drawer (Vanguard alt) | ⚠️ Same screen, different design system ("EFIMS Vanguard Precision" — teal/blue, Inter/JetBrains Mono). Source code comments on the botanical variant confirm this was the *original*, later restyled into the botanical palette — see `design-tokens/`. |
| [law-enforcement-liaison.html](screens/law-enforcement-liaison.html) | Law Enforcement Liaison & Warrant Tracking | Containment & Recovery sub-screen; EFCC/NFIU/INTERPOL coordination. |
| [multi-jurisdiction-compliance-matrix.html](screens/multi-jurisdiction-compliance-matrix.html) | Multi-Jurisdiction Compliance Matrix | Cross-border regulator matrix (CBN/NFIU/SEC/FATF/UK/US). |
| [case-closure-statutory-signoff.html](screens/case-closure-statutory-signoff.html) | Case Closure & Statutory Sign-off | Final disposition, multi-signer authorization, enforcement hand-off. |

Total screens now saved: **35** (20 batch 1 + 15 batch 2/3).

## Design token source documents

Two full `DESIGN.md`-style design-system exports arrived alongside batch 3, saved to
`design-tokens/`:

- [design-tokens/botanical-executive.md](design-tokens/botanical-executive.md) — matches the
  palette used by nearly all saved mockups (`primary #072320`, `primary-container #1e3835`,
  Playfair Display + Plus Jakarta Sans). **Its YAML frontmatter is internally inconsistent with
  its own prose** — the prose describes the *other*, non-matching palette. See the note appended
  to that file. Frontmatter should be treated as canonical.
- [design-tokens/efims-vanguard-precision.md](design-tokens/efims-vanguard-precision.md) — a
  second, distinct design system (teal/blue Material tokens, Inter + JetBrains Mono). Matches
  `command-center-alt.html` and `notification-center-drawer-vanguard.html`. Likely an earlier/
  discarded exploration superseded by Botanical Executive — see note in that file.

These resolved the design-token discrepancy flagged below — `docs/design-system.md` was
reconciled against `design-tokens/botanical-executive.md`'s frontmatter (and the mockups
directly) on 2026-09-18. See that doc's own changelog note at the top and the
[CHANGELOG.md](../docs/CHANGELOG.md) entry for that date.

## Not saved: one out-of-scope reference image

The last image in the batch-3 message was a "Velora — Premium Experience" dashboard — a
**different product**, not EFIMS (different name, different design system, unrelated domain).
Not saved as an EFIMS mockup; flagging here in case it was meant as a style reference rather than
an EFIMS screen.

## Design-token discrepancy — RESOLVED (2026-09-18)

`docs/design-system.md` v1.1.0 was authored from a standalone design-tokens/Storybook document
*before* any real screens existed, and used a different (wrong) Material-style token set than
what the actual mockups ship — e.g. `primary` `#1E3835` instead of `#072320`, and body font
`Inter` instead of `Plus Jakarta Sans`. This was reconciled in v1.2.0 of that doc: every color
and font token now matches the mockups verbatim, with each changed value marked inline for
traceability. See `docs/design-system.md`'s own header note and
[docs/CHANGELOG.md](../docs/CHANGELOG.md) (2026-09-18 entry) for the full list of corrections.
