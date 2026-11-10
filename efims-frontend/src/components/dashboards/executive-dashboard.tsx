import Link from "next/link";
import { getCaseStats } from "@/features/cases/api";
import { getIncidentStats } from "@/features/incidents/api";
import { getSeverityTrend } from "@/features/triage/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendChart } from "@/components/charts/trend-chart";

function formatNgn(amount: string): string {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(Number(amount));
}

/** Executive/CRO's "Executive risk overview" — a bespoke aggregate rollup, not the generic
 * `QueueDashboard` shell: an executive wants the whole portfolio's shape at a glance (loss vs.
 * recovered, case mix, incident pipeline), not a flat queue of individual rows to click into. */
export async function ExecutiveDashboard({ accessToken }: { accessToken: string }) {
  const [caseStats, incidentStats, severityTrend] = await Promise.all([
    getCaseStats(accessToken),
    getIncidentStats(accessToken),
    getSeverityTrend(accessToken, 30),
  ]);

  return (
    <>
      <div>
        <h1 className="font-headline text-2xl font-semibold text-primary">Executive risk overview</h1>
        <p className="mt-1 text-xs text-on-surface-variant">Aggregate posture across every case and incident accessible to you.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="flex flex-col justify-between rounded-2xl border border-primary/20 bg-primary-container p-6 text-on-primary shadow-hero">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-secondary-fixed uppercase">Outstanding exposure</span>
            <span className="material-symbols-outlined text-secondary-fixed">account_balance</span>
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
            <span className="material-symbols-outlined text-on-surface-variant">folder_managed</span>
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
            <span className="material-symbols-outlined text-error">hourglass_top</span>
          </div>
          <div className="mt-3 font-headline text-3xl font-bold text-error">{caseStats.pendingApprovals}</div>
          <p className="mt-1 text-xs text-on-surface-variant">Pending approval requests across all cases</p>
        </div>

        <div className="flex flex-col justify-between rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-6 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-outline uppercase">Incident pipeline</span>
            <span className="material-symbols-outlined text-on-surface-variant">crisis_alert</span>
          </div>
          <div className="mt-3 font-headline text-3xl font-bold text-primary">{incidentStats.total}</div>
          <p className="mt-1 text-xs text-on-surface-variant">{incidentStats.byStatus.OPEN} open · {incidentStats.linkedToCaseCount} linked to a case</p>
        </div>

        <div className="flex flex-col justify-between rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-6 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-outline uppercase">Compartmented</span>
            <span className="material-symbols-outlined text-on-surface-variant">encrypted</span>
          </div>
          <div className="mt-3 font-headline text-3xl font-bold text-primary">{incidentStats.restrictedCompartmentCount}</div>
          <p className="mt-1 text-xs text-on-surface-variant">Incidents outside STANDARD compartment</p>
        </div>

        <div className="flex flex-col justify-between rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-6 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-outline uppercase">Closed</span>
            <span className="material-symbols-outlined text-on-surface-variant">task_alt</span>
          </div>
          <div className="mt-3 font-headline text-3xl font-bold text-primary">{caseStats.byStatus.CLOSED}</div>
          <p className="mt-1 text-xs text-on-surface-variant">Cases resolved to date</p>
        </div>
      </div>

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
    </>
  );
}
