import Link from "next/link";
import { getCaseStats } from "@/features/cases/api";
import { getIncidentStats } from "@/features/incidents/api";
import { getSeverityTrend } from "@/features/triage/api";
import { getRecoveryRegister } from "@/features/recovery/api";
import { listTeams } from "@/features/teams/api";
import { SEVERITY_COLOR } from "@/lib/severity-colors";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendChart } from "@/components/charts/trend-chart";
import { RecoveryBarChart } from "@/components/charts/recovery-bar-chart";
import { SegmentedBar, type SegmentedBarPart } from "@/components/charts/segmented-bar";
import { Sparkline } from "@/components/charts/sparkline";
import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

function formatNgn(amount: string): string {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(Number(amount));
}

/** Fixed, never-cycled color assignment for the 6 `IncidentStatus` values — a status palette
 * (per the dataviz skill), not a generic categorical ramp, so each value keeps the same color
 * regardless of which statuses are present or how large their counts are. Deliberately distinct
 * from the severity tokens below: reusing e.g. `--color-severity-s3` here would make an
 * "UNDER_REVIEW" incident segment visually read as an S3-severity signal, which it isn't. */
const INCIDENT_STATUS_COLOR: Record<string, { color: string; colorHex: string }> = {
  OPEN: { color: "var(--color-tertiary)", colorHex: "#2563eb" },
  UNDER_REVIEW: { color: "var(--color-secondary)", colorHex: "#475569" },
  LINKED_TO_CASE: { color: "var(--color-primary)", colorHex: "#072320" },
  MERGED: { color: "var(--color-outline)", colorHex: "#94a3b8" },
  REJECTED: { color: "var(--color-error)", colorHex: "#ba1a1a" },
  CLOSED_NO_CASE: { color: "var(--color-surface-container-highest)", colorHex: "#cbd5e1" },
};
const INCIDENT_STATUS_LABEL: Record<string, string> = {
  OPEN: "Open",
  UNDER_REVIEW: "Under review",
  LINKED_TO_CASE: "Linked to case",
  MERGED: "Merged",
  REJECTED: "Rejected",
  CLOSED_NO_CASE: "Closed (no case)",
};

/** Executive/CRO's "Executive risk overview" — a bespoke aggregate rollup, not the generic
 * `QueueDashboard` shell: an executive wants the whole portfolio's shape at a glance (loss vs.
 * recovered, case mix, incident pipeline), not a flat queue of individual rows to click into.
 * Operations | Analytics tabs (the hybrid design spec's pattern) are scoped to this one
 * dashboard only — the other 16 `QueueDashboard`-driven roles are "my queue" views where a
 * population-level Analytics tab would be a dead control, not a 20-dashboard rollout. First real
 * consumer of `src/components/ui/tabs.tsx` (installed, previously unused anywhere). */
export async function ExecutiveDashboard({ accessToken }: { accessToken: string }) {
  const [caseStats, incidentStats, severityTrend, recoveryRegister, teams] = await Promise.all([
    getCaseStats(accessToken),
    getIncidentStats(accessToken),
    getSeverityTrend(accessToken, 30),
    getRecoveryRegister(accessToken),
    listTeams(accessToken),
  ]);

  const recoveryBars = recoveryRegister
    .slice()
    .sort((a, b) => Number(b.totalLoss) - Number(a.totalLoss))
    .slice(0, 8)
    .map((r) => ({ caseRef: r.referenceCode, loss: Number(r.totalLoss), recovered: Number(r.totalRecovered) }));

  // Daily assessment-volume sparkline for the "Incident pipeline" tile — a real proxy for intake
  // tempo (how many triage assessments were recorded per day), reusing the same 30-day window
  // already fetched for the Analytics tab's trend chart rather than a separate call.
  const dailyAssessmentVolume = severityTrend.map((d) => d.S1 + d.S2 + d.S3 + d.S4);

  const severityParts: SegmentedBarPart[] = (["S1", "S2", "S3", "S4"] as const).map((tier) => ({
    key: tier,
    label: `Severity ${tier}`,
    value: caseStats.bySeverity[tier],
    ...SEVERITY_COLOR[tier],
  }));

  const incidentStatusParts: SegmentedBarPart[] = Object.entries(INCIDENT_STATUS_LABEL).map(([status, label]) => ({
    key: status,
    label,
    value: incidentStats.byStatus[status as keyof typeof incidentStats.byStatus] ?? 0,
    ...INCIDENT_STATUS_COLOR[status],
  }));

  return (
    <>
      <div>
        <h1 className="font-headline text-2xl font-semibold text-primary">Executive risk overview</h1>
        <p className="mt-1 text-xs text-on-surface-variant">Aggregate posture across every case and incident accessible to you.</p>
      </div>

      <Tabs defaultValue="operations">
        <TabsList variant="line">
          <TabsTrigger value="operations">Operations</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="operations" className="flex flex-col gap-6 pt-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="flex flex-col justify-between rounded-2xl border border-primary/20 bg-primary-container p-6 text-on-primary shadow-hero">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-secondary-fixed uppercase">Outstanding exposure</span>
            <span className="flex size-9 items-center justify-center rounded-full bg-white/10">
              <span className="material-symbols-outlined text-secondary-fixed">account_balance</span>
            </span>
          </div>
          <div className="mt-3 font-headline text-3xl font-bold text-surface-bright">{formatNgn(caseStats.outstanding)}</div>
          <p className="mt-1 text-xs text-on-primary-container">of {formatNgn(caseStats.totalLoss)} total recorded loss</p>
          <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3 text-xs text-on-primary-container">
            <span>Recovered</span>
            <span className="font-semibold text-secondary-fixed">{formatNgn(caseStats.totalRecovered)}</span>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-6 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-outline uppercase">Case portfolio</span>
            <span className="flex size-9 items-center justify-center rounded-full bg-primary-container/50">
              <span className="material-symbols-outlined text-primary">folder_managed</span>
            </span>
          </div>
          <div className="mt-3 font-headline text-3xl font-bold text-primary">{caseStats.total}</div>
          <p className="mt-1 text-xs text-on-surface-variant">{caseStats.byStatus.OPEN} open · {caseStats.byStatus.UNDER_INVESTIGATION} under investigation</p>
          <div className="mt-4 flex items-center justify-between border-t border-outline-variant/20 pt-3 text-xs text-on-surface-variant">
            <span>High sensitivity (Tier 4)</span>
            <span className="font-semibold text-primary">{caseStats.highSensitivityCount}</span>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-2xl border border-error/30 bg-error-container/20 p-6 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-error uppercase">Decisions needed</span>
            <span className="flex size-9 items-center justify-center rounded-full bg-error/15">
              <span className="material-symbols-outlined text-error">hourglass_top</span>
            </span>
          </div>
          <div className="mt-3 font-headline text-3xl font-bold text-error">{caseStats.pendingApprovals}</div>
          <p className="mt-1 text-xs text-on-surface-variant">Pending approval requests across all cases</p>
        </div>

        <div className="flex flex-col justify-between rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-6 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-outline uppercase">Incident pipeline</span>
            <span className="flex size-9 items-center justify-center rounded-full bg-tertiary-container">
              <span className="material-symbols-outlined text-tertiary">crisis_alert</span>
            </span>
          </div>
          <div className="mt-3 flex items-end justify-between gap-2">
            <div>
              <div className="font-headline text-3xl font-bold text-primary">{incidentStats.total}</div>
              <p className="mt-1 text-xs text-on-surface-variant">{incidentStats.byStatus.OPEN} open · {incidentStats.linkedToCaseCount} linked to a case</p>
            </div>
            {dailyAssessmentVolume.length >= 2 && (
              <div className="mb-1 shrink-0" title="Daily triage-assessment volume, last 30 days">
                <Sparkline data={dailyAssessmentVolume} accent="var(--color-tertiary)" />
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-6 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-outline uppercase">Compartmented</span>
            <span className="flex size-9 items-center justify-center rounded-full bg-secondary-container">
              <span className="material-symbols-outlined text-secondary">encrypted</span>
            </span>
          </div>
          <div className="mt-3 font-headline text-3xl font-bold text-primary">{incidentStats.restrictedCompartmentCount}</div>
          <p className="mt-1 text-xs text-on-surface-variant">Incidents outside STANDARD compartment</p>
        </div>

        <div className="flex flex-col justify-between rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-6 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-outline uppercase">Closed</span>
            <span className="flex size-9 items-center justify-center rounded-full bg-surface-container-high">
              <span className="material-symbols-outlined text-on-surface-variant">task_alt</span>
            </span>
          </div>
          <div className="mt-3 font-headline text-3xl font-bold text-primary">{caseStats.byStatus.CLOSED}</div>
          <p className="mt-1 text-xs text-on-surface-variant">Cases resolved to date</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="border-outline-variant shadow-card lg:col-span-2">
          <CardHeader><CardTitle className="text-sm font-bold text-on-surface">Portfolio composition</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div>
              <p className="mb-2 text-[11px] font-semibold tracking-wider text-outline uppercase">Case severity mix</p>
              <SegmentedBar parts={severityParts} />
            </div>
            <div>
              <p className="mb-2 text-[11px] font-semibold tracking-wider text-outline uppercase">Incident status mix</p>
              <SegmentedBar parts={incidentStatusParts} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-outline-variant shadow-card">
          <CardHeader><CardTitle className="text-sm font-bold text-on-surface">Response teams</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            {teams.length === 0 ? (
              <p className="py-2 text-xs text-on-surface-variant">No teams configured yet.</p>
            ) : (
              <>
                <AvatarGroup>
                  {teams.slice(0, 6).map((t) => (
                    <Avatar key={t.id} title={t.name}>
                      <AvatarFallback className="bg-primary-container text-[11px] font-bold text-primary">
                        {t.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                  {teams.length > 6 && <AvatarGroupCount>+{teams.length - 6}</AvatarGroupCount>}
                </AvatarGroup>
                <p className="text-xs text-on-surface-variant">{teams.length} response team{teams.length === 1 ? "" : "s"} configured for this tenant.</p>
                <ul className="flex flex-col gap-1 text-xs text-on-surface-variant">
                  {teams.slice(0, 5).map((t) => (
                    <li key={t.id} className="truncate">· {t.name}</li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link href="/cases" className="rounded-full bg-primary px-5 py-2.5 text-xs font-semibold text-on-primary shadow-card transition-all hover:bg-primary-container">
          Review case portfolio
        </Link>
        <Link href="/incidents" className="rounded-full bg-surface-container px-5 py-2.5 text-xs font-semibold text-on-surface-variant transition-colors hover:text-on-surface">
          Review incident pipeline
        </Link>
        <Link href="/audit" className="rounded-full bg-surface-container px-5 py-2.5 text-xs font-semibold text-on-surface-variant transition-colors hover:text-on-surface">
          Audit trail
        </Link>
      </div>
        </TabsContent>

        <TabsContent value="analytics" className="flex flex-col gap-6 pt-4">
          <Card className="border-outline-variant shadow-card">
            <CardHeader><CardTitle className="text-sm font-bold text-on-surface">Severity trend — last 30 days</CardTitle></CardHeader>
            <CardContent>
              {severityTrend.length === 0 ? (
                <p className="py-6 text-center text-xs text-on-surface-variant">No triage assessments in this window yet.</p>
              ) : (
                <TrendChart
                  data={severityTrend}
                  series={[
                    { key: "S1", label: "S1", color: "var(--color-severity-s1)" },
                    { key: "S2", label: "S2", color: "var(--color-severity-s2)" },
                    { key: "S3", label: "S3", color: "var(--color-severity-s3)" },
                    { key: "S4", label: "S4", color: "var(--color-severity-s4)" },
                  ]}
                />
              )}
            </CardContent>
          </Card>

          <Card className="border-outline-variant shadow-card">
            <CardHeader><CardTitle className="text-sm font-bold text-on-surface">Recovery — verified loss vs. reconciled recovery</CardTitle></CardHeader>
            <CardContent>
              {recoveryBars.length === 0 ? (
                <p className="py-6 text-center text-xs text-on-surface-variant">No loss/recovery activity recorded yet.</p>
              ) : (
                <RecoveryBarChart data={recoveryBars} />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
