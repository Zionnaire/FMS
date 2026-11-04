import Link from "next/link";
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

export default async function SignalsPage(props: PageProps<"/signals">) {
  const searchParams = await props.searchParams;
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
          <h1 className="font-headline text-2xl font-semibold text-primary">Signal queue</h1>
          <p className="mt-1 text-xs text-on-surface-variant">{stats.total} total — unvalidated reports awaiting a triage decision.</p>
        </div>
        <Link href="/signals/new" className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-xs font-semibold text-on-primary shadow-card transition-all hover:bg-primary-container">
          <span className="material-symbols-outlined text-base">add_box</span>
          Log incident
        </Link>
      </div>

      {/* KPI hero row */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col justify-between rounded-2xl border border-primary/20 bg-primary-container p-5 text-on-primary shadow-hero">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-secondary-fixed uppercase">Intake volume</span>
            <span className="material-symbols-outlined text-secondary-fixed">flag</span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-headline text-3xl font-bold text-surface-bright">{stats.total}</span>
            <span className="rounded-full bg-secondary-container/30 px-2 py-0.5 text-xs font-medium text-secondary-fixed">
              {stats.byStatus.NEW} new
            </span>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3 text-xs text-on-primary-container">
            <span>All signals, this tenant</span>
            <span className="font-semibold text-secondary-fixed">Awaiting triage</span>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-5 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-outline uppercase">Validated</span>
            <span className="rounded-xl bg-tertiary-fixed p-2 text-tertiary">
              <span className="material-symbols-outlined text-base">task_alt</span>
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-headline text-3xl font-bold text-primary">{stats.byStatus.VALIDATED}</span>
          </div>
          <p className="mt-1 text-xs text-on-surface-variant">Promoted into an incident or linked to one</p>
          <div className="mt-4 flex items-center justify-between border-t border-outline-variant/20 pt-3 text-xs text-on-surface-variant">
            <span>Conversion rate</span>
            <span className="font-semibold text-primary">{stats.total > 0 ? Math.round((stats.byStatus.VALIDATED / stats.total) * 100) : 0}%</span>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-5 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-error uppercase">Rejected</span>
            <span className="rounded-xl bg-error-container p-2 text-on-error-container">
              <span className="material-symbols-outlined text-base">block</span>
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-headline text-3xl font-bold text-error">{stats.byStatus.REJECTED}</span>
          </div>
          <p className="mt-1 text-xs text-on-surface-variant">Determined not to warrant an incident</p>
          <div className="mt-4 flex items-center justify-between border-t border-outline-variant/20 pt-3 text-xs text-on-surface-variant">
            <span>Merged as corroboration</span>
            <span className="font-semibold text-primary">{stats.byStatus.MERGED}</span>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-5 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-outline uppercase">Whistleblower</span>
            <span className="rounded-xl bg-tertiary-fixed p-2 text-tertiary">
              <span className="material-symbols-outlined text-base">shield_person</span>
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-headline text-3xl font-bold text-primary">{stats.whistleblowerCount}</span>
          </div>
          <p className="mt-1 text-xs text-on-surface-variant">Reporter identity held in a separate vault</p>
          <div className="mt-4 flex items-center justify-between border-t border-outline-variant/20 pt-3 text-xs text-on-surface-variant">
            <span>Compartment</span>
            <span className="font-semibold text-primary">WHISTLEBLOWING</span>
          </div>
        </div>
      </div>

      {/* Filter controls */}
      <div className="space-y-4 rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-5 shadow-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-outline-variant/20 pb-3">
          <Link
            href={`/signals${preserved ? `?${preserved}` : ""}`}
            className={`rounded-full px-4 py-2 text-xs font-semibold transition-all ${!status ? "bg-primary text-on-primary" : "bg-surface-container text-on-surface-variant hover:text-on-surface"}`}
          >
            All <span className="ml-1 opacity-80">{stats.total}</span>
          </Link>
          {SIGNAL_STATUSES.map((s) => (
            <Link
              key={s}
              href={`/signals?status=${s}${preserved ? `&${preserved}` : ""}`}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition-all ${status === s ? "bg-primary text-on-primary" : "bg-surface-container text-on-surface-variant hover:text-on-surface"}`}
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
            <button type="submit" className="w-full rounded-full bg-primary px-3 py-2 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-container">
              Apply filters
            </button>
            <Link href="/signals" className="flex items-center justify-center gap-1 rounded-full bg-surface-container px-3 py-2 text-xs font-medium text-on-surface-variant transition-colors hover:text-primary">
              <span className="material-symbols-outlined text-base">filter_alt_off</span>
            </Link>
          </div>
        </form>
      </div>

      <div className="overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-card">
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
                    <span className="material-symbols-outlined text-sm text-primary">
                      {signal.source === "WHISTLEBLOWER" ? "shield_person" : signal.source === "RULE_ENGINE" ? "rule" : "person"}
                    </span>
                    {signal.source.replaceAll("_", " ")}
                  </span>
                </TableCell>
                <TableCell className="max-w-md">
                  <Link href={`/signals/${signal.id}`} className="truncate text-sm font-medium text-primary hover:underline">
                    {signal.summary}
                  </Link>
                </TableCell>
                <TableCell><StatusBadge status={signal.status} tone={signal.status === "NEW" ? "warning" : signal.status === "REJECTED" ? "critical" : "positive"} /></TableCell>
                <TableCell className="text-xs text-on-surface-variant">{new Date(signal.receivedAt).toLocaleString()}</TableCell>
                <TableCell className="text-center">
                  <Link href={`/signals/${signal.id}`} className="inline-flex rounded-full p-1.5 text-primary transition-colors hover:bg-surface-container" title="Open signal">
                    <span className="material-symbols-outlined text-base">visibility</span>
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
              <span className="material-symbols-outlined text-base">chevron_left</span>
            </Link>
            <Link
              aria-disabled={offset + PAGE_SIZE >= total}
              href={`/signals?${new URLSearchParams({ ...(status ? { status } : {}), ...(preserved ? Object.fromEntries(activeParams) : {}), offset: String(offset + PAGE_SIZE) })}`}
              className={`rounded-full border border-outline-variant/30 p-1.5 text-outline transition-colors ${offset + PAGE_SIZE >= total ? "pointer-events-none opacity-40" : "hover:bg-surface-container"}`}
            >
              <span className="material-symbols-outlined text-base">chevron_right</span>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
