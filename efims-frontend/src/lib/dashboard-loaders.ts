import type { DashboardData, DashboardRow } from "@/components/dashboards/queue-dashboard";
import type { Role, SessionUser } from "@/features/auth/types";
import type { CaseListItem, CaseStats } from "@/features/cases/types";
import { listSignals, getSignalStats } from "@/features/signals/api";
import { listIncidents, getIncidentStats } from "@/features/incidents/api";
import { listCases, getCaseStats } from "@/features/cases/api";
import { getEvidenceQueue } from "@/features/evidence/api";
import { getRecoveryQueue } from "@/features/recovery/api";
import { getOwnedCapaQueue, getCapaValidationQueue } from "@/features/capa/api";
import { getSeverityTrend } from "@/features/triage/api";
import { getRegulatoryRegister } from "@/features/regulatory/api";

const CASE_STATUS_TONE: Record<string, "positive" | "warning" | "critical" | "neutral"> = {
  OPEN: "warning",
  UNDER_INVESTIGATION: "warning",
  ON_HOLD: "neutral",
  CLOSED: "positive",
};

function formatNgn(amount: string): string {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(Number(amount));
}

/** Shared mapping from `CaseListItem` to `OperationalQueueTable`'s row shape — used by every
 * case-based role below. `team` stands in for the mockup reference's "owner" column (this app
 * has no per-user case-ownership field, only team assignment) and `compartment` stands in for
 * its "category" column (a Case has no category of its own; categories live on the incidents it
 * links, which can be several per case) — both real fields, deliberately substituted rather than
 * inventing ones that don't exist. */
function toRichRows(cases: CaseListItem[], href: (c: CaseListItem) => string): DashboardRow[] {
  return cases.map((c) => ({
    href: href(c),
    primary: c.title,
    secondary: c.referenceCode,
    compartment: c.compartment,
    severity: c.effectiveSeverity,
    team: c.assignedTeamName,
    slaBreached: c.isOverdue,
    badge: { label: c.status, tone: CASE_STATUS_TONE[c.status] },
  }));
}

/** The two extra real backend calls the institution-wide "pulse" strip needs, split out so every
 * case-based loader below can include them in its OWN single `Promise.all` alongside
 * `listCases`/`getCaseStats` — this dev database's own well-documented per-round-trip latency
 * (~10-13s observed earlier this session) means stacking these as a second sequential `await`
 * stage after the first batch doubles total load time for no reason; one batch, same as every
 * other dashboard in this app. */
function fetchInstitutionalRaw(accessToken: string) {
  return Promise.all([getSeverityTrend(accessToken, 84), getRegulatoryRegister(accessToken)]);
}

/** The institution-wide "pulse" strip above a case-based role's own queue — same real,
 * access-scoped data every such role already fetches for its own KPIs, just framed as shared
 * context (matches the "Overview" mockup's layout: tenant-wide trend + needs-attention panel
 * above a personal/team queue). `getRegulatoryRegister` and `getSeverityTrend` are both already
 * tenant-scoped-to-this-actor's-access the same way every other backend call in this app is —
 * nothing here is broadened beyond what the role could already see via its existing KPIs. Pure
 * formatting only — the fetch itself happens in `fetchInstitutionalRaw`, inside the caller's own
 * `Promise.all`. */
function buildInstitutionalContext(
  stats: CaseStats,
  severityTrend: Awaited<ReturnType<typeof getSeverityTrend>>,
  regulatoryRegister: Awaited<ReturnType<typeof getRegulatoryRegister>>,
): Pick<DashboardData, "trend" | "needsAttention"> {
  const pendingObligations = regulatoryRegister.filter((r) => r.status === "PENDING").length;
  return {
    trend: {
      title: "Incident activity — last 12 weeks",
      points: severityTrend.map((d) => ({ date: d.date, value: d.S1 + d.S2 + d.S3 + d.S4 })),
    },
    needsAttention: {
      items: [
        { title: "Overdue case SLAs", subtitle: "Cases", count: stats.overdueCount },
        { title: "Pending decision reviews", subtitle: "Approvals", count: stats.pendingApprovals },
        { title: "Reporting obligations", subtitle: "Reports", count: pendingObligations },
      ],
      reviewHref: "/approvals",
      reviewLabel: "Review decision queue",
    },
  };
}

/** Most of the 20 roles (see docs/CHANGELOG.md's dated entry for the full matrix) render the
 * shared `QueueDashboard` shell, driven by one of these loaders — each a real backend call (never
 * fabricated numbers, same standing rule as every other dashboard this project has built). A
 * handful of roles (`EXECUTIVE`, `INCIDENT_REPORTER`, `ADMIN`, `CONFIG_ADMIN`) have their own
 * bespoke component instead — `(app)/page.tsx` renders those directly rather than through this
 * map, since the generic "KPI row + flat queue" shape genuinely doesn't fit what they need to
 * show.
 *
 * 2026-11-13: the 8 case-based roles below additionally opt into `richTable` (real severity/
 * team/compartment/SLA columns, filterable, paginated) and the shared `trend`/`needsAttention`
 * strip — see `buildInstitutionalContext`'s own doc comment. The other 8 roles (signals,
 * evidence, recovery, CAPA, incident-only) keep the plain flat list: their rows are a different
 * entity shape with no honest severity/team/SLA to show, so forcing those columns on would mean
 * inventing data. */
export type DashboardLoader = (accessToken: string, user: SessionUser) => Promise<DashboardData>;

export const DASHBOARD_LOADERS: Partial<Record<Role, DashboardLoader>> = {
  TRIAGE_ANALYST: async (accessToken) => {
    const [{ signals }, stats] = await Promise.all([
      listSignals({ accessToken, status: "NEW", limit: 20 }),
      getSignalStats(accessToken),
    ]);
    return {
      title: "Intake priorities",
      subtitle: `${stats.byStatus.NEW} signal${stats.byStatus.NEW === 1 ? "" : "s"} awaiting a triage decision.`,
      kpis: [
        { label: "New signals", value: stats.byStatus.NEW, tone: "hero" },
        { label: "Validated", value: stats.byStatus.VALIDATED, dotColor: "var(--color-tertiary)" },
        { label: "Rejected", value: stats.byStatus.REJECTED, dotColor: "var(--color-error)" },
        { label: "Whistleblower", value: stats.whistleblowerCount, dotColor: "var(--color-secondary)" },
      ],
      queueTitle: "Awaiting triage",
      rows: signals.map((s) => ({
        href: `/signals/${s.id}`,
        primary: s.summary,
        secondary: s.source.replaceAll("_", " "),
        tertiary: new Date(s.receivedAt).toLocaleDateString(),
      })),
      emptyMessage: "No signals waiting on triage.",
      primaryAction: { label: "Log incident", href: "/signals/new" },
    };
  },

  CASE_OWNER: async (accessToken, user) => {
    // No per-user case-ownership field exists on Case yet (only assignedTeamId + createdBy) —
    // "my case desk" is approximated as "cases I personally created," the closest real proxy
    // available without a schema change. Flagged here, not silently assumed to be exact.
    const [{ cases }, stats, [severityTrend, regulatoryRegister]] = await Promise.all([
      listCases({ accessToken, limit: 100 }),
      getCaseStats(accessToken),
      fetchInstitutionalRaw(accessToken),
    ]);
    const mine = cases.filter((c) => c.createdBy === user.sub);
    const context = buildInstitutionalContext(stats, severityTrend, regulatoryRegister);
    return {
      title: "My case desk",
      subtitle: `${mine.length} case${mine.length === 1 ? "" : "s"} you opened, out of ${stats.total} accessible.`,
      kpis: [
        { label: "My cases", value: mine.length, tone: "hero" },
        { label: "Open", value: stats.byStatus.OPEN, dotColor: "var(--color-tertiary)" },
        { label: "Under investigation", value: stats.byStatus.UNDER_INVESTIGATION, dotColor: "var(--color-secondary)" },
        { label: "Pending approvals", value: stats.pendingApprovals, dotColor: "var(--color-error)" },
      ],
      ...context,
      queueTitle: "Cases I opened",
      rows: toRichRows(mine, (c) => `/cases/${c.id}`),
      richTable: true,
      emptyMessage: "You haven't opened a case yet.",
      primaryAction: { label: "New case", href: "/cases/new" },
    };
  },

  INVESTIGATOR: async (accessToken) => {
    const [{ cases }, stats, [severityTrend, regulatoryRegister]] = await Promise.all([
      listCases({ accessToken, status: "UNDER_INVESTIGATION", limit: 20 }),
      getCaseStats(accessToken),
      fetchInstitutionalRaw(accessToken),
    ]);
    const context = buildInstitutionalContext(stats, severityTrend, regulatoryRegister);
    return {
      title: "Investigation desk",
      subtitle: `${stats.byStatus.UNDER_INVESTIGATION} case${stats.byStatus.UNDER_INVESTIGATION === 1 ? "" : "s"} currently under investigation.`,
      kpis: [
        { label: "Under investigation", value: stats.byStatus.UNDER_INVESTIGATION, tone: "hero" },
        { label: "Total accessible", value: stats.total, dotColor: "var(--color-secondary)" },
        { label: "High sensitivity", value: stats.highSensitivityCount, dotColor: "var(--color-tertiary)" },
        { label: "Pending approvals", value: stats.pendingApprovals, dotColor: "var(--color-error)" },
      ],
      ...context,
      queueTitle: "Active investigations",
      rows: toRichRows(cases, (c) => `/cases/${c.id}/investigations`),
      richTable: true,
      emptyMessage: "No cases currently under investigation.",
      primaryAction: { label: "New case", href: "/cases/new" },
    };
  },

  TEAM_LEAD: async (accessToken) => {
    const [{ cases }, stats, [severityTrend, regulatoryRegister]] = await Promise.all([
      listCases({ accessToken, limit: 20 }),
      getCaseStats(accessToken),
      fetchInstitutionalRaw(accessToken),
    ]);
    const context = buildInstitutionalContext(stats, severityTrend, regulatoryRegister);
    return {
      title: "Team operations",
      subtitle: `${stats.total} accessible case${stats.total === 1 ? "" : "s"} across your team.`,
      kpis: [
        { label: "Open", value: stats.byStatus.OPEN, tone: "hero" },
        { label: "Pending approvals", value: stats.pendingApprovals, dotColor: "var(--color-error)" },
        { label: "High sensitivity", value: stats.highSensitivityCount, dotColor: "var(--color-tertiary)" },
        { label: "Closed", value: stats.byStatus.CLOSED, dotColor: "var(--color-secondary)" },
      ],
      ...context,
      queueTitle: "Team case queue",
      rows: toRichRows(cases, (c) => `/cases/${c.id}`),
      richTable: true,
      emptyMessage: "No cases in your team's queue.",
      primaryAction: { label: "New case", href: "/cases/new" },
    };
  },

  FRAUD_RISK_MANAGER: async (accessToken) => {
    const [{ cases }, stats, [severityTrend, regulatoryRegister]] = await Promise.all([
      listCases({ accessToken, limit: 20 }),
      getCaseStats(accessToken),
      fetchInstitutionalRaw(accessToken),
    ]);
    const context = buildInstitutionalContext(stats, severityTrend, regulatoryRegister);
    return {
      title: "Fraud risk oversight",
      subtitle: `${formatNgn(stats.outstanding)} outstanding exposure across ${stats.total} accessible case${stats.total === 1 ? "" : "s"}.`,
      kpis: [
        { label: "Outstanding exposure", value: formatNgn(stats.outstanding), tone: "hero" },
        { label: "Pending approvals", value: stats.pendingApprovals, dotColor: "var(--color-error)" },
        { label: "High sensitivity", value: stats.highSensitivityCount, dotColor: "var(--color-tertiary)" },
        { label: "Total cases", value: stats.total, dotColor: "var(--color-secondary)" },
      ],
      ...context,
      queueTitle: "Case portfolio",
      rows: toRichRows(cases, (c) => `/cases/${c.id}`),
      richTable: true,
      emptyMessage: "No cases accessible.",
      primaryAction: { label: "New case", href: "/cases/new" },
    };
  },

  EVIDENCE_CUSTODIAN: async (accessToken) => {
    const items = await getEvidenceQueue(accessToken);
    const unverified = items.filter((i) => !i.legalHold).length;
    const onHold = items.filter((i) => i.legalHold).length;
    return {
      title: "Custody operations",
      subtitle: `${items.length} evidence item${items.length === 1 ? "" : "s"} need attention across your accessible cases.`,
      kpis: [
        { label: "Needs attention", value: items.length, tone: "hero" },
        { label: "Never verified", value: unverified, dotColor: "var(--color-error)" },
        { label: "Under legal hold", value: onHold, dotColor: "var(--color-secondary)" },
      ],
      queueTitle: "Evidence needing attention",
      rows: items.map((i) => ({
        href: `/cases/${i.caseId}/evidence`,
        primary: i.title,
        secondary: i.category.replaceAll("_", " "),
        badge: i.legalHold ? { label: "LEGAL HOLD", tone: "critical" } : { label: "UNVERIFIED", tone: "warning" },
      })),
      emptyMessage: "No evidence items currently need attention.",
    };
  },

  SECURITY_ANALYST: async (accessToken) => {
    const [{ incidents }, stats] = await Promise.all([
      listIncidents({ accessToken, q: "Cyber", limit: 20 }),
      getIncidentStats(accessToken),
    ]);
    return {
      title: "Security incident desk",
      subtitle: `${incidents.length} cyber/information-security incident${incidents.length === 1 ? "" : "s"} in view.`,
      kpis: [
        { label: "Cyber incidents", value: incidents.length, tone: "hero" },
        { label: "Total accessible", value: stats.total, dotColor: "var(--color-secondary)" },
        { label: "Linked to case", value: stats.linkedToCaseCount, dotColor: "var(--color-tertiary)" },
        { label: "Restricted", value: stats.restrictedCompartmentCount, dotColor: "var(--color-error)" },
      ],
      queueTitle: "Cyber / information security incidents",
      rows: incidents.map((i) => ({
        href: `/incidents/${i.id}`,
        primary: i.title,
        secondary: `${i.category} / ${i.type}`,
        badge: { label: i.status, tone: i.status === "LINKED_TO_CASE" ? "positive" : "warning" },
      })),
      emptyMessage: "No cyber/information-security incidents in view.",
    };
  },

  OPERATIONS_OFFICER: async (accessToken) => {
    const [{ incidents }, stats] = await Promise.all([
      listIncidents({ accessToken, q: "Operational", limit: 20 }),
      getIncidentStats(accessToken),
    ]);
    return {
      title: "Operations desk",
      subtitle: `${incidents.length} operational incident${incidents.length === 1 ? "" : "s"} in view.`,
      kpis: [
        { label: "Operational incidents", value: incidents.length, tone: "hero" },
        { label: "Total accessible", value: stats.total, dotColor: "var(--color-secondary)" },
        { label: "Linked to case", value: stats.linkedToCaseCount, dotColor: "var(--color-tertiary)" },
        { label: "Open", value: stats.byStatus.OPEN, dotColor: "var(--color-error)" },
      ],
      queueTitle: "Operational incidents",
      rows: incidents.map((i) => ({
        href: `/incidents/${i.id}`,
        primary: i.title,
        secondary: `${i.category} / ${i.type}`,
        badge: { label: i.status, tone: i.status === "LINKED_TO_CASE" ? "positive" : "warning" },
      })),
      emptyMessage: "No operational incidents in view.",
    };
  },

  RECOVERY_OFFICER: async (accessToken) => {
    const rows = await getRecoveryQueue(accessToken);
    const totalOutstanding = rows.reduce((sum, r) => sum + Number(r.outstanding), 0);
    return {
      title: "Recovery ledger desk",
      subtitle: `${rows.length} case${rows.length === 1 ? "" : "s"} with outstanding exposure.`,
      kpis: [
        { label: "Total outstanding", value: formatNgn(totalOutstanding.toFixed(2)), tone: "hero" },
        { label: "Cases with exposure", value: rows.length, dotColor: "var(--color-secondary)" },
      ],
      queueTitle: "Outstanding exposure by case",
      rows: rows.map((r) => ({
        href: `/cases/${r.caseId}/recovery`,
        primary: `Case ${r.caseId.slice(0, 8)}`,
        secondary: "Outstanding exposure",
        tertiary: formatNgn(r.outstanding),
      })),
      emptyMessage: "No outstanding exposure across your accessible cases.",
    };
  },

  CONTROL_OWNER: async (accessToken) => {
    const actions = await getOwnedCapaQueue(accessToken);
    const overdue = actions.filter((a) => new Date(a.dueDate) < new Date()).length;
    return {
      title: "My corrective actions",
      subtitle: `${actions.length} open or in-progress action${actions.length === 1 ? "" : "s"} you own.`,
      kpis: [
        { label: "My actions", value: actions.length, tone: "hero" },
        { label: "Overdue", value: overdue, dotColor: "var(--color-error)" },
      ],
      queueTitle: "My open CAPA actions",
      rows: actions.map((a) => ({
        href: `/cases/${a.caseId}/capa`,
        primary: a.title,
        secondary: a.type,
        tertiary: `Due ${new Date(a.dueDate).toLocaleDateString()}`,
        badge: { label: a.status, tone: a.status === "IN_PROGRESS" ? "warning" : "neutral" },
      })),
      emptyMessage: "No open corrective actions assigned to you.",
    };
  },

  EFFECTIVENESS_REVIEWER: async (accessToken) => {
    const actions = await getCapaValidationQueue(accessToken);
    return {
      title: "Validation inbox",
      subtitle: `${actions.length} completed action${actions.length === 1 ? "" : "s"} awaiting independent validation.`,
      kpis: [{ label: "Awaiting validation", value: actions.length, tone: "hero" }],
      queueTitle: "Pending validation",
      rows: actions.map((a) => ({
        href: `/cases/${a.caseId}/capa`,
        primary: a.title,
        secondary: a.type,
        tertiary: a.completedAt ? new Date(a.completedAt).toLocaleDateString() : undefined,
        badge: { label: a.status, tone: "warning" },
      })),
      emptyMessage: "Nothing is waiting on your independent validation.",
    };
  },

  COMPLIANCE_MLRO: async (accessToken) => {
    const [{ cases }, stats, [severityTrend, regulatoryRegister]] = await Promise.all([
      listCases({ accessToken, compartment: "AML_MLRO", limit: 20 }),
      getCaseStats(accessToken),
      fetchInstitutionalRaw(accessToken),
    ]);
    const context = buildInstitutionalContext(stats, severityTrend, regulatoryRegister);
    return {
      title: "Statutory reporting desk",
      subtitle: `${cases.length} AML/MLRO case${cases.length === 1 ? "" : "s"}, ${stats.pendingApprovals} approval${stats.pendingApprovals === 1 ? "" : "s"} pending.`,
      kpis: [
        { label: "AML/MLRO cases", value: cases.length, tone: "hero" },
        { label: "Pending approvals", value: stats.pendingApprovals, dotColor: "var(--color-error)" },
        { label: "Total accessible", value: stats.total, dotColor: "var(--color-secondary)" },
      ],
      ...context,
      queueTitle: "AML/MLRO compartment cases",
      rows: toRichRows(cases, (c) => `/cases/${c.id}/regulatory`),
      richTable: true,
      emptyMessage: "No AML/MLRO compartment cases accessible.",
    };
  },

  LEGAL_COUNSEL: async (accessToken) => {
    const [{ cases }, stats, [severityTrend, regulatoryRegister]] = await Promise.all([
      listCases({ accessToken, compartment: "LEGAL_PRIVILEGE", limit: 20 }),
      getCaseStats(accessToken),
      fetchInstitutionalRaw(accessToken),
    ]);
    const context = buildInstitutionalContext(stats, severityTrend, regulatoryRegister);
    return {
      title: "Legal review desk",
      subtitle: `${cases.length} legally-privileged case${cases.length === 1 ? "" : "s"} accessible to you.`,
      kpis: [{ label: "Privileged cases", value: cases.length, tone: "hero" }],
      ...context,
      queueTitle: "Legal privilege compartment",
      rows: toRichRows(cases, (c) => `/cases/${c.id}`),
      richTable: true,
      emptyMessage: "No legally-privileged cases accessible.",
    };
  },

  HR_REVIEWER: async (accessToken) => {
    const [{ cases }, stats, [severityTrend, regulatoryRegister]] = await Promise.all([
      listCases({ accessToken, compartment: "HR", limit: 20 }),
      getCaseStats(accessToken),
      fetchInstitutionalRaw(accessToken),
    ]);
    const context = buildInstitutionalContext(stats, severityTrend, regulatoryRegister);
    return {
      title: "Restricted HR desk",
      subtitle: `${cases.length} HR-compartment case${cases.length === 1 ? "" : "s"} accessible to you.`,
      kpis: [{ label: "HR cases", value: cases.length, tone: "hero" }],
      ...context,
      queueTitle: "HR compartment",
      rows: toRichRows(cases, (c) => `/cases/${c.id}`),
      richTable: true,
      emptyMessage: "No HR-compartment cases accessible.",
    };
  },

  PROTECTED_DISCLOSURE_OFFICER: async (accessToken) => {
    const { signals, total } = await listSignals({ accessToken, source: "WHISTLEBLOWER", limit: 20 });
    return {
      title: "Protected intake desk",
      subtitle: `${total} whistleblower report${total === 1 ? "" : "s"} — metadata only, identity held in a separate vault.`,
      kpis: [{ label: "Whistleblower reports", value: total, tone: "hero" }],
      queueTitle: "Protected disclosures",
      rows: signals.map((s) => ({
        href: `/signals/${s.id}`,
        primary: s.summary,
        secondary: "WHISTLEBLOWER",
        badge: { label: s.status, tone: s.status === "NEW" ? "warning" : "positive" },
      })),
      emptyMessage: "No whistleblower reports in view.",
    };
  },

  AUDITOR: async (accessToken) => {
    const [{ cases }, caseStats, [severityTrend, regulatoryRegister]] = await Promise.all([
      listCases({ accessToken, limit: 20 }),
      getCaseStats(accessToken),
      fetchInstitutionalRaw(accessToken),
    ]);
    const context = buildInstitutionalContext(caseStats, severityTrend, regulatoryRegister);
    return {
      title: "Assurance review",
      subtitle: `${caseStats.total} case${caseStats.total === 1 ? "" : "s"} in scope for review.`,
      kpis: [
        { label: "Cases in scope", value: caseStats.total, tone: "hero" },
        { label: "Pending approvals", value: caseStats.pendingApprovals, dotColor: "var(--color-error)" },
        { label: "High sensitivity", value: caseStats.highSensitivityCount, dotColor: "var(--color-tertiary)" },
        { label: "Closed", value: caseStats.byStatus.CLOSED, dotColor: "var(--color-secondary)" },
      ],
      ...context,
      queueTitle: "Case register",
      rows: toRichRows(cases, (c) => `/cases/${c.id}`),
      richTable: true,
      emptyMessage: "No cases in scope.",
      primaryAction: { label: "Open audit trail", href: "/audit" },
    };
  },
};
