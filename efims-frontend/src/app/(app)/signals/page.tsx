import Link from "next/link";
import { Plus, Flag, CheckCircle2, XCircle, EyeOff, FilterX, ListChecks, User, Eye, ChevronLeft, ChevronRight } from "lucide-react";
import { requireSession } from "@/features/auth/session";
import { listSignals, getSignalStats } from "@/features/signals/api";
import { SIGNAL_SOURCES, SIGNAL_STATUSES, type SignalSource, type SignalStatus } from "@/features/signals/types";
import { StatusBadge } from "@/components/shell/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const PAGE_SIZE = 20;

function isSignalStatus(value: string | undefined): value is SignalStatus {
  return !!value && (SIGNAL_STATUSES as readonly string[]).includes(value);
}

function isSignalSource(value: string | undefined): value is SignalSource {
  return !!value && (SIGNAL_SOURCES as readonly string[]).includes(value);
}

/** Exported separately from the default page export so `/intake`'s Signals tab can render this
 * exact content as a tab panel without duplicating any data-fetching — see that page's own doc
 * comment. */
export async function SignalsPageContent(searchParams: { [key: string]: string | string[] | undefined }) {
  const status = isSignalStatus(searchParams.status as string | undefined) ? (searchParams.status as SignalStatus) : undefined;
  const source = isSignalSource(searchParams.source as string | undefined) ? (searchParams.source as SignalSource) : undefined;
  const q = (searchParams.q as string | undefined) || undefined;
  const offset = Number(searchParams.offset) || 0;

  const { accessToken } = await requireSession();
  const [{ signals, total }, stats] = await Promise.all([
    listSignals({ accessToken, status, source, q, limit: PAGE_SIZE, offset }),
    getSignalStats(accessToken),
  ]);

  const activeParams = new URLSearchParams();
  if (source) activeParams.set("source", source);
  if (q) activeParams.set("q", q);
  const preserved = activeParams.toString();

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Signal queue</h1>
          <p className="mt-1 text-xs text-on-surface-variant">{stats.total} total, unvalidated reports awaiting a triage decision.</p>
        </div>
        <Link href="/signals/new" className="flex items-center gap-2 rounded-lg bg-tertiary px-5 py-2.5 text-xs font-semibold text-on-tertiary shadow-card transition-colors hover:bg-tertiary/90">
          <Plus size={16} strokeWidth={2.5} />
          Log incident
        </Link>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-3 rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-card">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--color-tertiary) 16%, white)" }}>
              <Flag size={20} strokeWidth={2} className="text-tertiary" />
            </span>
            <span className="text-xs font-semibold text-on-surface-variant">Intake volume</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-[28px] leading-none font-bold text-on-surface">{stats.total}</span>
            <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-xs font-medium text-on-surface-variant">
              {stats.byStatus.NEW} new
            </span>
          </div>
          <p className="text-xs text-on-surface-variant">Awaiting triage</p>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-card">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--color-success) 16%, white)" }}>
              <CheckCircle2 size={20} strokeWidth={2} className="text-success" />
            </span>
            <span className="text-xs font-semibold text-on-surface-variant">Validated</span>
          </div>
          <span className="text-[28px] leading-none font-bold text-on-surface">{stats.byStatus.VALIDATED}</span>
          <p className="text-xs text-on-surface-variant">
            {stats.total > 0 ? Math.round((stats.byStatus.VALIDATED / stats.total) * 100) : 0}% conversion rate
          </p>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-card">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--color-error) 16%, white)" }}>
              <XCircle size={20} strokeWidth={2} className="text-error" />
            </span>
            <span className="text-xs font-semibold text-on-surface-variant">Rejected</span>
          </div>
          <span className="text-[28px] leading-none font-bold text-on-surface">{stats.byStatus.REJECTED}</span>
          <p className="text-xs text-on-surface-variant">{stats.byStatus.MERGED} merged as corroboration</p>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-card">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--color-secondary) 16%, white)" }}>
              <EyeOff size={20} strokeWidth={2} className="text-secondary" />
            </span>
            <span className="text-xs font-semibold text-on-surface-variant">Whistleblower</span>
          </div>
          <span className="text-[28px] leading-none font-bold text-on-surface">{stats.whistleblowerCount}</span>
          <p className="text-xs text-on-surface-variant">Reporter identity held in a separate vault</p>
        </div>
      </div>

      {/* Filter controls */}
      <div className="space-y-4 rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-outline-variant/20 pb-3">
          <Link
            href={`/signals${preserved ? `?${preserved}` : ""}`}
            className={`rounded-full px-4 py-2 text-xs font-semibold transition-all ${!status ? "bg-tertiary text-on-tertiary" : "bg-surface-container text-on-surface-variant hover:text-on-surface"}`}
          >
            All <span className="ml-1 opacity-80">{stats.total}</span>
          </Link>
          {SIGNAL_STATUSES.map((s) => (
            <Link
              key={s}
              href={`/signals?status=${s}${preserved ? `&${preserved}` : ""}`}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition-all ${status === s ? "bg-tertiary text-on-tertiary" : "bg-surface-container text-on-surface-variant hover:text-on-surface"}`}
            >
              {s} <span className="ml-1 opacity-80">{stats.byStatus[s]}</span>
            </Link>
          ))}
        </div>

        <form className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-3" action="/signals">
          {status && <input type="hidden" name="status" value={status} />}
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-outline uppercase">Search</label>
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Summary contains..."
              className="w-full rounded-full border border-outline-variant/30 bg-surface-container-low px-3.5 py-1.5 text-xs text-on-surface placeholder:text-outline/70 focus:ring-1 focus:ring-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-outline uppercase">Source</label>
            <select
              name="source"
              defaultValue={source ?? ""}
              className="w-full cursor-pointer rounded-full border border-outline-variant/30 bg-surface-container-low px-3.5 py-1.5 text-xs text-on-surface focus:ring-1 focus:ring-primary focus:outline-none"
            >
              <option value="">All sources</option>
              {SIGNAL_SOURCES.map((s) => (
                <option key={s} value={s}>{s.replaceAll("_", " ")}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button type="submit" className="w-full rounded-full bg-tertiary px-3 py-2 text-xs font-semibold text-on-tertiary transition-colors hover:bg-tertiary/90">
              Apply filters
            </button>
            <Link href="/signals" className="flex items-center justify-center gap-1 rounded-full bg-surface-container px-3 py-2 text-xs font-medium text-on-surface-variant transition-colors hover:text-primary">
              <FilterX size={16} strokeWidth={2} />
            </Link>
          </div>
        </form>
      </div>

      <div className="overflow-hidden rounded-xl border border-outline-variant/60 bg-surface-container-lowest shadow-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-surface-container-low">
              <TableHead>Source</TableHead>
              <TableHead>Summary</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Received</TableHead>
              <TableHead className="text-center">Open</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {signals.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-sm text-on-surface-variant">No signals match this filter.</TableCell>
              </TableRow>
            )}
            {signals.map((signal) => (
              <TableRow key={signal.id} className="hover:bg-surface-container-low/60">
                <TableCell>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-container px-2.5 py-1 text-xs font-medium text-on-surface-variant">
                    {signal.source === "WHISTLEBLOWER" ? (
                      <EyeOff size={14} strokeWidth={2} className="text-primary" />
                    ) : signal.source === "RULE_ENGINE" ? (
                      <ListChecks size={14} strokeWidth={2} className="text-primary" />
                    ) : (
                      <User size={14} strokeWidth={2} className="text-primary" />
                    )}
                    {signal.source.replaceAll("_", " ")}
                  </span>
                </TableCell>
                <TableCell className="max-w-md">
                  <Link href={`/signals/${signal.id}`} className="block truncate text-sm font-medium text-primary hover:underline">
                    {signal.summary}
                  </Link>
                </TableCell>
                <TableCell><StatusBadge status={signal.status} tone={signal.status === "NEW" ? "warning" : signal.status === "REJECTED" ? "critical" : "positive"} /></TableCell>
                <TableCell className="text-xs text-on-surface-variant">{new Date(signal.receivedAt).toLocaleString()}</TableCell>
                <TableCell className="text-center">
                  <Link href={`/signals/${signal.id}`} className="inline-flex rounded-full p-1.5 text-primary transition-colors hover:bg-surface-container" title="Open signal">
                    <Eye size={16} strokeWidth={2} />
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="flex flex-col items-center justify-between gap-3 border-t border-outline-variant/20 bg-surface-container-low/40 p-4 sm:flex-row">
          <div className="text-xs text-on-surface-variant">
            Showing <span className="font-semibold text-on-surface">{signals.length === 0 ? 0 : offset + 1}-{offset + signals.length}</span> of{" "}
            <span className="font-semibold text-on-surface">{total}</span> signals
          </div>
          <div className="flex items-center gap-2">
            <Link
              aria-disabled={offset === 0}
              href={`/signals?${new URLSearchParams({ ...(status ? { status } : {}), ...(preserved ? Object.fromEntries(activeParams) : {}), offset: String(Math.max(0, offset - PAGE_SIZE)) })}`}
              className={`rounded-full border border-outline-variant/30 p-1.5 text-outline transition-colors ${offset === 0 ? "pointer-events-none opacity-40" : "hover:bg-surface-container"}`}
            >
              <ChevronLeft size={16} strokeWidth={2} />
            </Link>
            <Link
              aria-disabled={offset + PAGE_SIZE >= total}
              href={`/signals?${new URLSearchParams({ ...(status ? { status } : {}), ...(preserved ? Object.fromEntries(activeParams) : {}), offset: String(offset + PAGE_SIZE) })}`}
              className={`rounded-full border border-outline-variant/30 p-1.5 text-outline transition-colors ${offset + PAGE_SIZE >= total ? "pointer-events-none opacity-40" : "hover:bg-surface-container"}`}
            >
              <ChevronRight size={16} strokeWidth={2} />
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}

export default async function SignalsPage(props: PageProps<"/signals">) {
  const searchParams = await props.searchParams;
  return SignalsPageContent(searchParams);
}
