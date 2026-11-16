import Link from "next/link";
import { Landmark, Briefcase, Hourglass, AlertTriangle, Lock, CheckCircle2, type LucideIcon } from "lucide-react";
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

/** Uniform white KPI tile with a colored icon badge — matches `QueueDashboard`'s `KpiTile`
 * pattern (Institutional Intelligence, 2026-11-14); no dark/"hero" card treatment anymore. */
function KpiTile({ label, value, sublabel, icon: Icon, color, trailing }: { label: string; value: string | number; sublabel?: string; icon: LucideIcon; color: string; trailing?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-card">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `color-mix(in srgb, ${color} 16%, white)` }}>
          <Icon size={20} strokeWidth={2} style={{ color }} />
        </span>
        <span className="text-xs font-semibold text-on-surface-variant">{label}</span>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div>
          <span className="text-[28px] leading-none font-bold text-on-surface">{value}</span>
          {sublabel && <p className="mt-1 text-xs text-on-surface-variant">{sublabel}</p>}
        </div>
        {trailing}
      </div>
    </div>
  );
}

function formatNgn(amount: string): string {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(Number(amount));
}

/** Fixed, never-cycled color assignment for the 6 `IncidentStatus` values — a status palette
 * (per the dataviz skill), not a generic categorical ramp, so each value keeps the same color
 * regardless of which statuses are present or how large their counts are. Deliberately distinct
 * from the severity tokens below: reusing e.g. `--color-severity-s3` here would make an
 * "UNDER_REVIEW" incident segment visually read as an S3-severity signal, which it isn't. */
const INCIDENT_STATUS_COLOR: Record<string, { color: string; colorHex: string }> = {
  OPEN: { color: "var(--color-tertiary)", colorHex: "#167d83" },
  UNDER_REVIEW: { color: "var(--color-secondary)", colorHex: "#64748b" },
  LINKED_TO_CASE: { color: "var(--color-primary)", colorHex: "#172b45" },
  MERGED: { color: "var(--color-outline)", colorHex: "#c7d0d9" },
  REJECTED: { color: "var(--color-error)", colorHex: "#b94343" },
  CLOSED_NO_CASE: { color: "var(--color-surface-container-highest)", colorHex: "#dfe5eb" },
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
        <h1 className="text-2xl font-bold text-on-surface">Executive risk overview</h1>
        <p className="mt-1 text-xs text-on-surface-variant">Aggregate posture across every case and incident accessible to you.</p>
      </div>

      <Tabs defaultValue="operations">
        <TabsList variant="line">
          <TabsTrigger value="operations">Operations</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="operations" className="flex flex-col gap-6 pt-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <KpiTile
          label="Outstanding exposure"
          value={formatNgn(caseStats.outstanding)}
          sublabel={`Recovered ${formatNgn(caseStats.totalRecovered)} of ${formatNgn(caseStats.totalLoss)} total loss`}
          icon={Landmark}
          color="var(--color-tertiary)"
        />

        <KpiTile
          label="Case portfolio"
          value={caseStats.total}
          sublabel={`${caseStats.byStatus.OPEN} open · ${caseStats.byStatus.UNDER_INVESTIGATION} under investigation`}
          icon={Briefcase}
          color="var(--color-secondary)"
        />

        <KpiTile
          label="Decisions needed"
          value={caseStats.pendingApprovals}
          sublabel="Pending approval requests across all cases"
          icon={Hourglass}
          color="var(--color-error)"
        />

        <KpiTile
          label="Incident pipeline"
          value={incidentStats.total}
          sublabel={`${incidentStats.byStatus.OPEN} open · ${incidentStats.linkedToCaseCount} linked to a case`}
          icon={AlertTriangle}
          color="var(--color-tertiary)"
          trailing={
            dailyAssessmentVolume.length >= 2 ? (
              <div className="shrink-0" title="Daily triage-assessment volume, last 30 days">
                <Sparkline data={dailyAssessmentVolume} accent="var(--color-tertiary)" />
              </div>
            ) : undefined
          }
        />

        <KpiTile
          label="Compartmented"
          value={incidentStats.restrictedCompartmentCount}
          sublabel="Incidents outside STANDARD compartment"
          icon={Lock}
          color="var(--color-secondary)"
        />

        <KpiTile
          label="Closed"
          value={caseStats.byStatus.CLOSED}
          sublabel="Cases resolved to date"
          icon={CheckCircle2}
          color="var(--color-success)"
        />
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
                      <AvatarFallback className="bg-tertiary-container text-[11px] font-bold text-tertiary">
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
        <Link href="/cases" className="rounded-lg bg-tertiary px-5 py-2.5 text-xs font-semibold text-on-tertiary shadow-card transition-colors hover:bg-tertiary/90">
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
