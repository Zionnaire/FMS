import Link from "next/link";
import { Plus } from "lucide-react";
import { listSignals } from "@/features/signals/api";
import { StatusBadge } from "@/components/shell/status-badge";

/** Incident Reporter's "My reports" — bespoke, not `QueueDashboard`: deliberately no KPI hero row
 * (a reporter's own submission count isn't a metric worth a dashboard card) and no sidenav access
 * to Cases/Incidents/Signals browsing at all (see `sidenav.tsx`'s role filters) — "own reports
 * only, no enterprise case browsing" per the role brief this expansion is built from. Shows each
 * submitted signal's status and, once validated, a link to the incident it became
 * (`signal.incidentId` — the actual incident, not an approximation; see the signal-validate
 * redirect bug fixed earlier this project for why that field is the correct one to trust here). */
export async function ReporterDashboard({ accessToken }: { accessToken: string }) {
  const { signals, total } = await listSignals({ accessToken, mine: true, limit: 50 });

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">My reports</h1>
          <p className="mt-1 text-xs text-on-surface-variant">{total} report{total === 1 ? "" : "s"} you&apos;ve submitted.</p>
        </div>
        <Link
          href="/signals/new"
          className="flex items-center gap-2 rounded-lg bg-tertiary px-5 py-2.5 text-xs font-semibold text-on-tertiary shadow-card transition-colors hover:bg-tertiary/90"
        >
          <Plus size={16} strokeWidth={2.5} />
          Report incident
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-outline-variant/60 bg-surface-container-lowest shadow-card">
        {signals.length === 0 ? (
          <div className="p-8 text-center text-sm text-on-surface-variant">
            You haven&apos;t submitted a report yet. Use &quot;Report incident&quot; to file one.
          </div>
        ) : (
          <ul className="divide-y divide-outline-variant/20">
            {signals.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-4 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-on-surface">{s.summary}</p>
                  <p className="text-xs text-on-surface-variant">{new Date(s.receivedAt).toLocaleString()}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {s.incidentId && (
                    <Link href={`/incidents/${s.incidentId}`} className="text-xs font-semibold text-primary hover:underline">
                      View incident
                    </Link>
                  )}
                  <StatusBadge status={s.status} tone={s.status === "NEW" ? "warning" : s.status === "REJECTED" ? "critical" : "positive"} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
