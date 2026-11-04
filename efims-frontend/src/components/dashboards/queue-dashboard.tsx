import Link from "next/link";
import { StatusBadge } from "@/components/shell/status-badge";

export interface DashboardKpi {
  label: string;
  value: string | number;
  icon: string;
  sublabel?: string;
  tone?: "hero" | "neutral" | "error";
}

export interface DashboardRow {
  href: string;
  primary: string;
  secondary?: string;
  tertiary?: string;
  badge?: { label: string; tone: "positive" | "warning" | "critical" | "neutral" };
}

export interface DashboardData {
  title: string;
  subtitle: string;
  kpis: DashboardKpi[];
  queueTitle: string;
  queueIcon: string;
  rows: DashboardRow[];
  emptyMessage: string;
  primaryAction?: { label: string; href: string };
}

/**
 * One shared presentational shell for every role whose dashboard is fundamentally "KPI row +
 * curated queue + one primary action" — which is most of the 20 roles added 2026-10-14 (see
 * docs/CHANGELOG.md's dated entry for the full role matrix). Each role's own loader (`
 * lib/dashboard-loaders.ts`) is what varies — a different real backend call, a different queue,
 * different KPI numbers — not this component. A handful of roles (Executive/CRO's aggregate
 * rollup, Incident Reporter's "my submissions", System Administrator's directory, Configuration
 * Administrator's governance register) render their own bespoke component instead, where this
 * generic "flat list of rows" shape doesn't fit what they actually need to show.
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
        {data.kpis.map((kpi) => (
          <div
            key={kpi.label}
            className={`flex flex-col justify-between rounded-2xl border p-5 shadow-card ${
              kpi.tone === "hero"
                ? "border-primary/20 bg-primary-container text-on-primary shadow-hero"
                : kpi.tone === "error"
                  ? "border-error/30 bg-error-container/20"
                  : "border-outline-variant/40 bg-surface-container-lowest"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className={`text-xs font-semibold tracking-wider uppercase ${kpi.tone === "hero" ? "text-secondary-fixed" : "text-outline"}`}>
                {kpi.label}
              </span>
              <span className={`material-symbols-outlined ${kpi.tone === "hero" ? "text-secondary-fixed" : "text-on-surface-variant"}`}>
                {kpi.icon}
              </span>
            </div>
            <div className="mt-3">
              <span className={`font-headline text-3xl font-bold ${kpi.tone === "hero" ? "text-surface-bright" : "text-primary"}`}>{kpi.value}</span>
            </div>
            {kpi.sublabel && (
              <p className={`mt-1 text-xs ${kpi.tone === "hero" ? "text-on-primary-container" : "text-on-surface-variant"}`}>{kpi.sublabel}</p>
            )}
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-card">
        <div className="flex items-center gap-2 border-b border-outline-variant/30 bg-surface-container-low px-5 py-3">
          <span className="material-symbols-outlined text-base text-primary">{data.queueIcon}</span>
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
    </>
  );
}
