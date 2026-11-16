import Link from "next/link";
import { Plus, ChevronRight, ShieldCheck, ArrowRight, type LucideIcon } from "lucide-react";
import { StatusBadge } from "@/components/shell/status-badge";
import { ActivityTrendChart, type ActivityTrendPoint } from "@/components/charts/activity-trend-chart";
import { SegmentedBar, type SegmentedBarPart } from "@/components/charts/segmented-bar";
import { OperationalQueueTable } from "./operational-queue-table";
import type { SeverityTier } from "@/features/cases/types";

export interface DashboardKpi {
  label: string;
  value: string | number;
  icon: LucideIcon;
  /** A `var(--color-...)` (or plain CSS color) used to tint the icon badge — every KPI tile is a
   * uniform white card (per the Institutional Intelligence reference, which uses no "hero"
   * dark-filled card at all), differentiated only by this badge tint. */
  color: string;
  sublabel?: string;
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

export interface RecentActivityItem {
  title: string;
  subtitle: string;
  timestamp: string;
}

export interface DashboardAttentionItem {
  title: string;
  subtitle: string;
  count: number;
  icon: LucideIcon;
  color: string;
}

export interface DashboardData {
  title: string;
  subtitle: string;
  kpis: DashboardKpi[];
  /** Tenant-wide activity pulse — same real data every role's loader can see (scoped by that
   * role's own backend access, same as everything else), framed as institution-wide context
   * around this role's own queue below, matching the Institutional Intelligence reference's
   * layout. */
  trend?: { title: string; points: ActivityTrendPoint[] };
  /** Case severity mix — sits in the layout slot the reference uses for its "Risk by Category"
   * donut. That donut's center figure ("68% Overall Risk") has no real backing metric in this
   * system (no risk-scoring model produces an aggregate percentage), so this uses the segmented
   * bar already built for the Executive dashboard with real `CaseStats.bySeverity` data instead
   * of fabricating a risk percentage to fill the reference's exact chart type. */
  severityMix?: SegmentedBarPart[];
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
  const Icon = kpi.icon;
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-card">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `color-mix(in srgb, ${kpi.color} 16%, white)` }}>
          <Icon size={20} strokeWidth={2} style={{ color: kpi.color }} />
        </span>
        <span className="text-xs font-semibold text-on-surface-variant">{kpi.label}</span>
      </div>
      <span className="font-sans text-[28px] leading-none font-bold text-on-surface">{kpi.value}</span>
      {kpi.sublabel && <p className="text-xs text-on-surface-variant">{kpi.sublabel}</p>}
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
 * Restyled 2026-11-14 against the Institutional Intelligence reference image: uniform white KPI
 * tiles with a colored icon badge (replacing both the earlier icon-chip style and the brief
 * dot-only style that preceded it), a real-data severity-mix card in the reference's donut slot,
 * and Lucide icons throughout in place of the Material Symbols ligature font.
 */
function formatActivityTime(iso: string): string {
  const date = new Date(iso);
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay
    ? date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function QueueDashboard({ data, recentActivity }: { data: DashboardData; recentActivity?: RecentActivityItem[] }) {
  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">{data.title}</h1>
          <p className="mt-1 text-xs text-on-surface-variant">{data.subtitle}</p>
        </div>
        {data.primaryAction && (
          <Link
            href={data.primaryAction.href}
            className="flex items-center gap-2 rounded-lg bg-tertiary px-5 py-2.5 text-xs font-semibold text-on-tertiary shadow-card transition-colors hover:bg-tertiary/90"
          >
            <Plus size={16} strokeWidth={2.5} />
            {data.primaryAction.label}
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {data.kpis.map((kpi) => <KpiTile key={kpi.label} kpi={kpi} />)}
      </div>

      {(data.trend || data.severityMix || data.needsAttention) && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {data.trend && (
            <div className="rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-card lg:col-span-2">
              <h2 className="text-sm font-bold text-on-surface">{data.trend.title}</h2>
              {data.trend.points.length < 2 ? (
                <p className="py-10 text-center text-xs text-on-surface-variant">Not enough history in this window yet.</p>
              ) : (
                <ActivityTrendChart data={data.trend.points} />
              )}
            </div>
          )}

          {data.severityMix && !data.trend && (
            <div className="rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-card lg:col-span-2">
              <h2 className="mb-3 text-sm font-bold text-on-surface">Case severity mix</h2>
              <SegmentedBar parts={data.severityMix} />
            </div>
          )}

          {data.needsAttention && (
            <div className="flex flex-col rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-card">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-bold text-on-surface">Matters requiring attention</h2>
                <Link href={data.needsAttention.reviewHref} className="text-[11px] font-semibold text-tertiary hover:underline">
                  View all →
                </Link>
              </div>
              <ul className="flex flex-col gap-3">
                {data.needsAttention.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.title} className="flex items-start gap-3">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `color-mix(in srgb, ${item.color} 16%, white)` }}>
                        <Icon size={16} strokeWidth={2} style={{ color: item.color }} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-on-surface">{item.title}</p>
                        <p className="truncate text-[11px] text-on-surface-variant">{item.subtitle}</p>
                      </div>
                      <span className="shrink-0 text-lg font-bold text-on-surface">{item.count}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {data.severityMix && data.trend && (
            <div className="rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-card lg:col-span-3">
              <h2 className="mb-3 text-sm font-bold text-on-surface">Case severity mix</h2>
              <SegmentedBar parts={data.severityMix} />
            </div>
          )}
        </div>
      )}

      {data.richTable ? (
        <OperationalQueueTable rows={data.rows} emptyMessage={data.emptyMessage} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-outline-variant/60 bg-surface-container-lowest shadow-card">
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
                      <ChevronRight size={16} className="text-outline" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {recentActivity && recentActivity.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-card lg:col-span-2">
            <h2 className="mb-3 text-sm font-bold text-on-surface">Recent activity</h2>
            <ul className="flex flex-col gap-4">
              {recentActivity.map((item, i) => (
                <li key={`${item.title}-${item.timestamp}-${i}`} className="flex items-start gap-3">
                  <div className="flex flex-col items-center self-stretch">
                    <span className="size-2.5 shrink-0 rounded-full border-2 border-tertiary" />
                    {i < recentActivity.length - 1 && <span className="mt-1 w-px flex-1 bg-outline-variant" />}
                  </div>
                  <div className="min-w-0 flex-1 pb-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate text-xs font-semibold text-on-surface">{item.title}</p>
                      <span className="shrink-0 text-[11px] text-on-surface-variant">{formatActivityTime(item.timestamp)}</span>
                    </div>
                    <p className="truncate text-[11px] text-on-surface-variant">{item.subtitle}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col justify-between rounded-xl bg-primary p-5 text-on-primary shadow-card">
            <div>
              <span className="flex size-10 items-center justify-center rounded-full bg-tertiary text-on-tertiary">
                <ShieldCheck size={20} strokeWidth={2} />
              </span>
              <h2 className="mt-3 text-base font-bold">EFIMS</h2>
              <p className="text-xs font-medium text-on-primary-container">Intelligence. Action. Integrity.</p>
              <p className="mt-2 text-xs text-on-primary-container">
                A unified platform for detecting, investigating and resolving financial crime.
              </p>
            </div>
            <Link href="/configuration" className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-lg bg-on-primary px-3.5 py-2 text-xs font-semibold text-primary transition-colors hover:bg-on-primary/90">
              Learn more
              <ArrowRight size={14} strokeWidth={2.5} />
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
