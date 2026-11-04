import type { DashboardData } from "@/components/dashboards/queue-dashboard";
import type { Role, SessionUser } from "@/features/auth/types";
import { listSignals, getSignalStats } from "@/features/signals/api";
import { listIncidents, getIncidentStats } from "@/features/incidents/api";
import { listCases, getCaseStats } from "@/features/cases/api";
import { getEvidenceQueue } from "@/features/evidence/api";
import { getRecoveryQueue } from "@/features/recovery/api";
import { getOwnedCapaQueue, getCapaValidationQueue } from "@/features/capa/api";

const CASE_STATUS_TONE: Record<string, "positive" | "warning" | "critical" | "neutral"> = {
  OPEN: "warning",
  UNDER_INVESTIGATION: "warning",
  ON_HOLD: "neutral",
  CLOSED: "positive",
};

function formatNgn(amount: string): string {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(Number(amount));
}

/** Most of the 20 roles (see docs/CHANGELOG.md's dated entry for the full matrix) render the
 * shared `QueueDashboard` shell, driven by one of these loaders — each a real backend call (never
 * fabricated numbers, same standing rule as every other dashboard this project has built). A
 * handful of roles (`EXECUTIVE`, `INCIDENT_REPORTER`, `ADMIN`, `CONFIG_ADMIN`) have their own
 * bespoke component instead — `(app)/page.tsx` renders those directly rather than through this
 * map, since the generic "KPI row + flat queue" shape genuinely doesn't fit what they need to
 * show. */
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
        { label: "New signals", value: stats.byStatus.NEW, icon: "flag", tone: "hero" },
        { label: "Validated", value: stats.byStatus.VALIDATED, icon: "task_alt" },
        { label: "Rejected", value: stats.byStatus.REJECTED, icon: "block" },
        { label: "Whistleblower", value: stats.whistleblowerCount, icon: "shield_person" },
      ],
      queueTitle: "Awaiting triage",
      queueIcon: "pending_actions",
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
    const [{ cases }, stats] = await Promise.all([listCases({ accessToken, limit: 100 }), getCaseStats(accessToken)]);
    const mine = cases.filter((c) => c.createdBy === user.sub);
    return {
      title: "My case desk",
      subtitle: `${mine.length} case${mine.length === 1 ? "" : "s"} you opened, out of ${stats.total} accessible.`,
      kpis: [
        { label: "My cases", value: mine.length, icon: "folder_managed", tone: "hero" },
        { label: "Open", value: stats.byStatus.OPEN, icon: "lock_open" },
        { label: "Under investigation", value: stats.byStatus.UNDER_INVESTIGATION, icon: "search" },
        { label: "Pending approvals", value: stats.pendingApprovals, icon: "hourglass_top" },
      ],
      queueTitle: "Cases I opened",
      queueIcon: "folder_managed",
      rows: mine.map((c) => ({
        href: `/cases/${c.id}`,
        primary: c.title,
        secondary: c.referenceCode,
        badge: { label: c.status, tone: CASE_STATUS_TONE[c.status] },
      })),
      emptyMessage: "You haven't opened a case yet.",
      primaryAction: { label: "New case", href: "/cases/new" },
    };
  },

  INVESTIGATOR: async (accessToken) => {
    const [{ cases }, stats] = await Promise.all([
      listCases({ accessToken, status: "UNDER_INVESTIGATION", limit: 20 }),
      getCaseStats(accessToken),
    ]);
    return {
      title: "Investigation desk",
      subtitle: `${stats.byStatus.UNDER_INVESTIGATION} case${stats.byStatus.UNDER_INVESTIGATION === 1 ? "" : "s"} currently under investigation.`,
      kpis: [
        { label: "Under investigation", value: stats.byStatus.UNDER_INVESTIGATION, icon: "search", tone: "hero" },
        { label: "Total accessible", value: stats.total, icon: "folder_managed" },
        { label: "High sensitivity", value: stats.highSensitivityCount, icon: "shield" },
        { label: "Pending approvals", value: stats.pendingApprovals, icon: "hourglass_top" },
      ],
      queueTitle: "Active investigations",
      queueIcon: "policy",
      rows: cases.map((c) => ({
        href: `/cases/${c.id}/investigations`,
        primary: c.title,
        secondary: c.referenceCode,
        badge: { label: c.status, tone: CASE_STATUS_TONE[c.status] },
      })),
      emptyMessage: "No cases currently under investigation.",
      primaryAction: { label: "New case", href: "/cases/new" },
    };
  },

  TEAM_LEAD: async (accessToken) => {
    const [{ cases }, stats] = await Promise.all([listCases({ accessToken, limit: 20 }), getCaseStats(accessToken)]);
    return {
      title: "Team operations",
      subtitle: `${stats.total} accessible case${stats.total === 1 ? "" : "s"} across your team.`,
      kpis: [
        { label: "Open", value: stats.byStatus.OPEN, icon: "lock_open", tone: "hero" },
        { label: "Pending approvals", value: stats.pendingApprovals, icon: "hourglass_top" },
        { label: "High sensitivity", value: stats.highSensitivityCount, icon: "shield" },
        { label: "Closed", value: stats.byStatus.CLOSED, icon: "task_alt" },
      ],
      queueTitle: "Team case queue",
      queueIcon: "groups",
      rows: cases.map((c) => ({
        href: `/cases/${c.id}`,
        primary: c.title,
        secondary: `${c.referenceCode} — ${c.assignedTeamName ?? "Unassigned"}`,
        badge: { label: c.status, tone: CASE_STATUS_TONE[c.status] },
      })),
      emptyMessage: "No cases in your team's queue.",
      primaryAction: { label: "New case", href: "/cases/new" },
    };
  },

  FRAUD_RISK_MANAGER: async (accessToken) => {
    const [{ cases }, stats] = await Promise.all([listCases({ accessToken, limit: 20 }), getCaseStats(accessToken)]);
    return {
      title: "Fraud risk oversight",
      subtitle: `${formatNgn(stats.outstanding)} outstanding exposure across ${stats.total} accessible case${stats.total === 1 ? "" : "s"}.`,
      kpis: [
        { label: "Outstanding exposure", value: formatNgn(stats.outstanding), icon: "account_balance", tone: "hero" },
        { label: "Pending approvals", value: stats.pendingApprovals, icon: "hourglass_top" },
        { label: "High sensitivity", value: stats.highSensitivityCount, icon: "shield" },
        { label: "Total cases", value: stats.total, icon: "folder_managed" },
      ],
      queueTitle: "Case portfolio",
      queueIcon: "insights",
      rows: cases.map((c) => ({
        href: `/cases/${c.id}`,
        primary: c.title,
        secondary: c.referenceCode,
        tertiary: `Tier ${c.sensitivityLevel}`,
        badge: { label: c.status, tone: CASE_STATUS_TONE[c.status] },
      })),
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
        { label: "Needs attention", value: items.length, icon: "lock", tone: "hero" },
        { label: "Never verified", value: unverified, icon: "fingerprint" },
        { label: "Under legal hold", value: onHold, icon: "gavel" },
      ],
      queueTitle: "Evidence needing attention",
      queueIcon: "inventory_2",
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
        { label: "Cyber incidents", value: incidents.length, icon: "security", tone: "hero" },
        { label: "Total accessible", value: stats.total, icon: "crisis_alert" },
        { label: "Linked to case", value: stats.linkedToCaseCount, icon: "link" },
        { label: "Restricted", value: stats.restrictedCompartmentCount, icon: "encrypted" },
      ],
      queueTitle: "Cyber / information security incidents",
      queueIcon: "security",
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
        { label: "Operational incidents", value: incidents.length, icon: "settings_suggest", tone: "hero" },
        { label: "Total accessible", value: stats.total, icon: "crisis_alert" },
        { label: "Linked to case", value: stats.linkedToCaseCount, icon: "link" },
        { label: "Open", value: stats.byStatus.OPEN, icon: "lock_open" },
      ],
      queueTitle: "Operational incidents",
      queueIcon: "settings_suggest",
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
        { label: "Total outstanding", value: formatNgn(totalOutstanding.toFixed(2)), icon: "account_balance", tone: "hero" },
        { label: "Cases with exposure", value: rows.length, icon: "receipt_long" },
      ],
      queueTitle: "Outstanding exposure by case",
      queueIcon: "account_balance",
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
        { label: "My actions", value: actions.length, icon: "fact_check", tone: "hero" },
        { label: "Overdue", value: overdue, icon: "warning" },
      ],
      queueTitle: "My open CAPA actions",
      queueIcon: "fact_check",
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
      kpis: [{ label: "Awaiting validation", value: actions.length, icon: "verified", tone: "hero" }],
      queueTitle: "Pending validation",
      queueIcon: "verified",
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
    const [{ cases }, stats] = await Promise.all([listCases({ accessToken, compartment: "AML_MLRO", limit: 20 }), getCaseStats(accessToken)]);
    return {
      title: "Statutory reporting desk",
      subtitle: `${cases.length} AML/MLRO case${cases.length === 1 ? "" : "s"}, ${stats.pendingApprovals} approval${stats.pendingApprovals === 1 ? "" : "s"} pending.`,
      kpis: [
        { label: "AML/MLRO cases", value: cases.length, icon: "account_balance", tone: "hero" },
        { label: "Pending approvals", value: stats.pendingApprovals, icon: "hourglass_top" },
        { label: "Total accessible", value: stats.total, icon: "folder_managed" },
      ],
      queueTitle: "AML/MLRO compartment cases",
      queueIcon: "account_balance",
      rows: cases.map((c) => ({
        href: `/cases/${c.id}/regulatory`,
        primary: c.title,
        secondary: c.referenceCode,
        badge: { label: c.status, tone: CASE_STATUS_TONE[c.status] },
      })),
      emptyMessage: "No AML/MLRO compartment cases accessible.",
    };
  },

  LEGAL_COUNSEL: async (accessToken) => {
    const { cases } = await listCases({ accessToken, compartment: "LEGAL_PRIVILEGE", limit: 20 });
    return {
      title: "Legal review desk",
      subtitle: `${cases.length} legally-privileged case${cases.length === 1 ? "" : "s"} accessible to you.`,
      kpis: [{ label: "Privileged cases", value: cases.length, icon: "gavel", tone: "hero" }],
      queueTitle: "Legal privilege compartment",
      queueIcon: "gavel",
      rows: cases.map((c) => ({
        href: `/cases/${c.id}`,
        primary: c.title,
        secondary: c.referenceCode,
        badge: { label: c.status, tone: CASE_STATUS_TONE[c.status] },
      })),
      emptyMessage: "No legally-privileged cases accessible.",
    };
  },

  HR_REVIEWER: async (accessToken) => {
    const { cases } = await listCases({ accessToken, compartment: "HR", limit: 20 });
    return {
      title: "Restricted HR desk",
      subtitle: `${cases.length} HR-compartment case${cases.length === 1 ? "" : "s"} accessible to you.`,
      kpis: [{ label: "HR cases", value: cases.length, icon: "badge", tone: "hero" }],
      queueTitle: "HR compartment",
      queueIcon: "badge",
      rows: cases.map((c) => ({
        href: `/cases/${c.id}`,
        primary: c.title,
        secondary: c.referenceCode,
        badge: { label: c.status, tone: CASE_STATUS_TONE[c.status] },
      })),
      emptyMessage: "No HR-compartment cases accessible.",
    };
  },

  PROTECTED_DISCLOSURE_OFFICER: async (accessToken) => {
    const { signals, total } = await listSignals({ accessToken, source: "WHISTLEBLOWER", limit: 20 });
    return {
      title: "Protected intake desk",
      subtitle: `${total} whistleblower report${total === 1 ? "" : "s"} — metadata only, identity held in a separate vault.`,
      kpis: [{ label: "Whistleblower reports", value: total, icon: "shield_person", tone: "hero" }],
      queueTitle: "Protected disclosures",
      queueIcon: "shield_person",
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
    const [{ cases }, caseStats] = await Promise.all([listCases({ accessToken, limit: 20 }), getCaseStats(accessToken)]);
    return {
      title: "Assurance review",
      subtitle: `${caseStats.total} case${caseStats.total === 1 ? "" : "s"} in scope for review.`,
      kpis: [
        { label: "Cases in scope", value: caseStats.total, icon: "fact_check", tone: "hero" },
        { label: "Pending approvals", value: caseStats.pendingApprovals, icon: "hourglass_top" },
        { label: "High sensitivity", value: caseStats.highSensitivityCount, icon: "shield" },
        { label: "Closed", value: caseStats.byStatus.CLOSED, icon: "task_alt" },
      ],
      queueTitle: "Case register",
      queueIcon: "fact_check",
      rows: cases.map((c) => ({
        href: `/cases/${c.id}`,
        primary: c.title,
        secondary: c.referenceCode,
        badge: { label: c.status, tone: CASE_STATUS_TONE[c.status] },
      })),
      emptyMessage: "No cases in scope.",
      primaryAction: { label: "Open audit trail", href: "/audit" },
    };
  },
};
