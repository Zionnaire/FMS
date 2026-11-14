import Link from "next/link";
import { StatusBadge } from "@/components/shell/status-badge";
import { ActivityTrendChart, type ActivityTrendPoint } from "@/components/charts/activity-trend-chart";
import { OperationalQueueTable } from "./operational-queue-table";
import type { SeverityTier } from "@/features/cases/types";

export interface DashboardKpi {
  label: string;
  value: string | number;
  /** A `var(--color-...)` (or plain CSS color) painted as a small dot beside the label — matches
   * the "Overview" mockup's flat dot-style KPI tiles. Omit for a neutral/no-dot tile (most
   * loaders' KPIs have no natural severity-like color to show). */
  dotColor?: string;
  sublabel?: string;
  tone?: "hero" | "neutral" | "error";
}

export interface DashboardRow {
  href: string;
  primary: string;
  secondary?: string;
  tertiary?: string;
  badge?: { label: string; tone: "positive" | "warning" | "critical" | "neutral" };
  /** Rich-table-only fields. Present together (or not at all) per loader — when a loader's rows
   * carry these, `DashboardData.richTable` opts into `OperationalQueueTable`'s filterable/
   * paginated rendering instead of the plain flat list below. All real backend-sourced fields,
   * never fabricated to fill a column: `team` is `Case.assignedTeamName` (this app has no
   * per-user case-ownership field, so there is no honest individual "owner" to show), and
   * `compartment` stands in for the mockup's "category" column, since a Case has no category of
   * its own (categories live on the incidents it links, and a case can link several). */
  compartment?: string;
  severity?: SeverityTier | null;
  team?: string | null;
  slaBreached?: boolean;
}

export interface DashboardAttentionItem {
  title: string;
  subtitle: string;
  count: number;
}

export interface DashboardData {
  title: string;
  subtitle: string;
  kpis: DashboardKpi[];
  /** Tenant-wide activity pulse — same real data every role's loader can see (scoped by that
   * role's own backend access, same as everything else), framed as institution-wide context
   * around this role's own queue below, matching the "Overview" mockup's layout. */
  trend?: { title: string; points: ActivityTrendPoint[] };
  needsAttention?: { items: DashboardAttentionItem[]; reviewHref: string; reviewLabel: string };
  queueTitle: string;
  rows: DashboardRow[];
  /** Opt into `OperationalQueueTable`'s real columns + severity/overdue filter + pagination.
   * Only set by loaders whose rows actually carry `severity`/`team`/`compartment`/`slaBreached` —
   * everyone else keeps the plain flat list, since forcing those columns onto e.g. an evidence or
   * CAPA queue would mean inventing fields that entity doesn't have. */
  richTable?: boolean;
  emptyMessage: string;
  primaryAction?: { label: string; href: string };
}

function KpiTile({ kpi }: { kpi: DashboardKpi }) {
  return (
    <div
      className={`flex flex-col justify-between rounded-2xl border p-5 shadow-card ${
        kpi.tone === "hero"
          ? "border-primary/20 bg-primary-container text-on-primary shadow-hero"
          : kpi.tone === "error"
            ? "border-error/30 bg-error-container/20"
            : "border-outline-variant/40 bg-surface-container-lowest"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: kpi.dotColor ?? "var(--color-outline)" }} />
        <span className={`text-xs font-semibold tracking-wider uppercase ${kpi.tone === "hero" ? "text-secondary-fixed" : "text-outline"}`}>
          {kpi.label}
        </span>
      </div>
      <div className="mt-3">
        <span className={`font-headline text-3xl font-bold ${kpi.tone === "hero" ? "text-surface-bright" : "text-primary"}`}>{kpi.value}</span>
      </div>
      {kpi.sublabel && (
        <p className={`mt-1 text-xs ${kpi.tone === "hero" ? "text-on-primary-container" : "text-on-surface-variant"}`}>{kpi.sublabel}</p>
      )}
    </div>
  );
}

/**
 * One shared presentational shell for every role whose dashboard is fundamentally "KPI row +
 * curated queue + one primary action" — which is most of the 20 roles added 2026-10-14 (see
 * docs/CHANGELOG.md's dated entry for the full role matrix). Each role's own loader (`
 * lib/dashboard-loaders.ts`) is what varies — a different real backend call, a different queue,
 * different KPI numbers — not this component. A handful of roles (Executive/CRO's aggregate
 * rollup, Incident Reporter's "my submissions", System Administrator's directory, Configuration
 * Administrator's governance register) render their own bespoke component instead, where this
 * generic shape genuinely doesn't fit what they need to show.
 *
 * Restyled 2026-11-13 against a full-resolution "Overview" mockup reference: flat dot-style KPI
 * tiles (no icon chips), an optional tenant-wide activity trend + "needs attention" panel above
 * the role's own queue, and a real filterable/paginated table for roles whose rows support it.
 */
export function QueueDashboard({ data }: { data: DashboardData }) {
  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-headline text-2xl font-semibold text-primary">{data.title}</h1>
          <p className="mt-1 text-xs text-on-surface-variant">{data.subtitle}</p>
        </div>
        {data.primaryAction && (
          <Link
            href={data.primaryAction.href}
            className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-xs font-semibold text-on-primary shadow-card transition-all hover:bg-primary-container"
          >
            <span className="material-symbols-outlined text-base">add_box</span>
            {data.primaryAction.label}
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {data.kpis.map((kpi) => <KpiTile key={kpi.label} kpi={kpi} />)}
      </div>

      {(data.trend || data.needsAttention) && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {data.trend && (
            <div className={`rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-card ${data.needsAttention ? "lg:col-span-2" : "lg:col-span-3"}`}>
              <h2 className="text-sm font-bold text-on-surface">{data.trend.title}</h2>
              {data.trend.points.length < 2 ? (
                <p className="py-10 text-center text-xs text-on-surface-variant">Not enough history in this window yet.</p>
              ) : (
                <ActivityTrendChart data={data.trend.points} />
              )}
            </div>
          )}
          {data.needsAttention && (
            <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-card">
              <h2 className="text-sm font-bold text-on-surface">Needs attention</h2>
              <ul className="mt-3 flex flex-col gap-3">
                {data.needsAttention.items.map((item) => (
                  <li key={item.title} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-on-surface">{item.title}</p>
                      <p className="truncate text-[11px] text-on-surface-variant">{item.subtitle}</p>
                    </div>
                    <span className="shrink-0 font-headline text-lg font-bold text-primary">{item.count}</span>
                  </li>
                ))}
              </ul>
              <Link href={data.needsAttention.reviewHref} className="mt-4 inline-block text-xs font-semibold text-primary underline-offset-4 hover:underline">
                {data.needsAttention.reviewLabel} →
              </Link>
            </div>
          )}
        </div>
      )}

      {data.richTable ? (
        <OperationalQueueTable rows={data.rows} emptyMessage={data.emptyMessage} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-card">
          <div className="border-b border-outline-variant/30 bg-surface-container-low px-5 py-3">
            <h2 className="text-sm font-bold text-on-surface">{data.queueTitle}</h2>
          </div>
          {data.rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-on-surface-variant">{data.emptyMessage}</div>
          ) : (
            <ul className="divide-y divide-outline-variant/20">
              {data.rows.map((row) => (
                <li key={row.href + row.primary}>
                  <Link href={row.href} className="flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-surface-container-low/60">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-on-surface">{row.primary}</p>
                      {row.secondary && <p className="truncate text-xs text-on-surface-variant">{row.secondary}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      {row.tertiary && <span className="text-xs text-on-surface-variant">{row.tertiary}</span>}
                      {row.badge && <StatusBadge status={row.badge.label} tone={row.badge.tone} />}
                      <span className="material-symbols-outlined text-base text-outline">chevron_right</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}
