import Link from "next/link";
import { requireSession } from "@/features/auth/session";
import { getAuditStats, queryAuditEvents, verifyAuditChain } from "@/features/audit/api";
import { AUDIT_OUTCOMES, type AuditOutcome } from "@/features/audit/types";
import { listUsers, userDisplayNameMap } from "@/features/users/api";
import { ApiError } from "@/lib/backend-client";
import { StatusBadge } from "@/components/shell/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";

const PAGE_SIZE = 50;

function isOutcome(value: string | undefined): value is AuditOutcome {
  return !!value && (AUDIT_OUTCOMES as readonly string[]).includes(value);
}

export default async function AuditPage(props: PageProps<"/audit">) {
  const searchParams = await props.searchParams;
  const outcome = isOutcome(searchParams.outcome as string | undefined) ? (searchParams.outcome as AuditOutcome) : undefined;
  const entityType = (searchParams.entityType as string | undefined) || undefined;
  const action = (searchParams.action as string | undefined) || undefined;
  const from = (searchParams.from as string | undefined) || undefined;
  const to = (searchParams.to as string | undefined) || undefined;

  const { accessToken } = await requireSession();

  let events, total;
  try {
    ({ events, total } = await queryAuditEvents({ accessToken, outcome, entityType, action, from, to, limit: PAGE_SIZE }));
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      return (
        <Card className="border-outline-variant shadow-card">
          <CardContent className="pt-4 text-sm text-on-surface-variant">
            Your role doesn&apos;t have oversight access to the audit trail.
          </CardContent>
        </Card>
      );
    }
    throw error;
  }

  const [chain, stats, users] = await Promise.all([verifyAuditChain(accessToken), getAuditStats(accessToken), listUsers(accessToken)]);
  const nameOf = userDisplayNameMap(users);

  const activeParams = new URLSearchParams();
  if (entityType) activeParams.set("entityType", entityType);
  if (action) activeParams.set("action", action);
  if (from) activeParams.set("from", from);
  if (to) activeParams.set("to", to);
  const preserved = activeParams.toString();

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-headline text-2xl font-semibold text-primary">Audit trail</h1>
          <p className="mt-1 text-xs text-on-surface-variant">{stats.total} events — append-only, tamper-evident hash chain.</p>
        </div>
      </div>

      {/* KPI hero row */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className={`flex flex-col justify-between rounded-2xl border p-5 shadow-hero ${chain.intact ? "border-primary/20 bg-primary-container text-on-primary" : "border-error/40 bg-error-container text-on-error-container"}`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-semibold tracking-wider uppercase ${chain.intact ? "text-secondary-fixed" : "text-on-error-container"}`}>Hash chain</span>
            <span className="material-symbols-outlined">{chain.intact ? "verified" : "gpp_bad"}</span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className={`font-headline text-2xl font-bold ${chain.intact ? "text-surface-bright" : "text-on-error-container"}`}>
              {chain.intact ? "Intact" : "Broken"}
            </span>
          </div>
          <div className={`mt-4 flex items-center justify-between border-t pt-3 text-xs ${chain.intact ? "border-white/10 text-on-primary-container" : "border-error/20 text-on-error-container"}`}>
            <span>{chain.eventsChecked} events verified</span>
            {chain.breaks.length > 0 && <span className="font-semibold">{chain.breaks.length} break{chain.breaks.length === 1 ? "" : "s"}</span>}
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-5 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-outline uppercase">Success</span>
            <span className="rounded-xl bg-tertiary-fixed p-2 text-tertiary">
              <span className="material-symbols-outlined text-base">check_circle</span>
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-headline text-3xl font-bold text-primary">{stats.byOutcome.SUCCESS}</span>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-outline-variant/20 pt-3 text-xs text-on-surface-variant">
            <span>of {stats.total} total</span>
            <span className="font-semibold text-primary">{stats.total > 0 ? Math.round((stats.byOutcome.SUCCESS / stats.total) * 100) : 0}%</span>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-5 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-outline uppercase">Denied</span>
            <span className="rounded-xl bg-secondary-container/30 p-2 text-secondary">
              <span className="material-symbols-outlined text-base">block</span>
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-headline text-3xl font-bold text-secondary">{stats.byOutcome.DENIED}</span>
          </div>
          <p className="mt-1 text-xs text-on-surface-variant">Access-control denials — CLAUDE.md #6</p>
        </div>

        <div className="flex flex-col justify-between rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-5 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-error uppercase">Failure</span>
            <span className="rounded-xl bg-error-container p-2 text-on-error-container">
              <span className="material-symbols-outlined text-base">error</span>
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-headline text-3xl font-bold text-error">{stats.byOutcome.FAILURE}</span>
          </div>
          <p className="mt-1 text-xs text-on-surface-variant">Operation-level failures, not access denials</p>
        </div>
      </div>

      {chain.breaks.length > 0 && (
        <div className="space-y-3 rounded-2xl border border-error/30 bg-error-container/20 p-5 shadow-card">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-error">gpp_bad</span>
            <h2 className="text-sm font-bold text-on-error-container">Chain breaks — {chain.breaks.length} event{chain.breaks.length === 1 ? "" : "s"} don&apos;t verify</h2>
          </div>
          <p className="text-xs text-on-error-container/80">
            Per CLAUDE.md non-negotiable #3, audit rows can never be rewritten — even to correct a hashing bug in the code
            that wrote them — so a documented historical break stays visible here permanently rather than being silently
            repaired. Each row below is independently verified; a break doesn&apos;t cascade into flagging events written
            after it.
          </p>
          <ul className="space-y-1.5">
            {chain.breaks.map((b) => (
              <li key={b.eventId} className="flex items-center justify-between rounded-xl bg-surface-container-lowest p-2.5 text-xs">
                <span className="font-mono text-on-surface">{b.action}</span>
                <span className="text-on-surface-variant">{b.entityType}{b.entityId && ` #${b.entityId.slice(0, 8)}`}</span>
                <span className="text-on-surface-variant">{new Date(b.createdAt).toLocaleString()}</span>
                <span className="rounded-full bg-error-container px-2 py-0.5 font-semibold text-on-error-container">{b.reason.replaceAll("_", " ")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Filter controls */}
      <div className="space-y-4 rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-5 shadow-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-outline-variant/20 pb-3">
          <Link
            href={`/audit${preserved ? `?${preserved}` : ""}`}
            className={`rounded-full px-4 py-2 text-xs font-semibold transition-all ${!outcome ? "bg-primary text-on-primary" : "bg-surface-container text-on-surface-variant hover:text-on-surface"}`}
          >
            All <span className="ml-1 opacity-80">{stats.total}</span>
          </Link>
          {AUDIT_OUTCOMES.map((o) => (
            <Link
              key={o}
              href={`/audit?outcome=${o}${preserved ? `&${preserved}` : ""}`}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition-all ${outcome === o ? "bg-primary text-on-primary" : "bg-surface-container text-on-surface-variant hover:text-on-surface"}`}
            >
              {o} <span className="ml-1 opacity-80">{stats.byOutcome[o]}</span>
            </Link>
          ))}
        </div>

        <form className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2 lg:grid-cols-5" action="/audit">
          {outcome && <input type="hidden" name="outcome" value={outcome} />}
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-outline uppercase">Entity type</label>
            <input
              type="text"
              name="entityType"
              defaultValue={entityType}
              placeholder="Case, Incident, Signal..."
              className="w-full rounded-full border border-outline-variant/30 bg-surface-container-low px-3.5 py-1.5 text-xs text-on-surface placeholder:text-outline/70 focus:ring-1 focus:ring-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-outline uppercase">Action</label>
            <input
              type="text"
              name="action"
              defaultValue={action}
              placeholder="cases.case.view..."
              className="w-full rounded-full border border-outline-variant/30 bg-surface-container-low px-3.5 py-1.5 text-xs text-on-surface placeholder:text-outline/70 focus:ring-1 focus:ring-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-outline uppercase">From</label>
            <input
              type="datetime-local"
              name="from"
              defaultValue={from}
              className="w-full rounded-full border border-outline-variant/30 bg-surface-container-low px-3.5 py-1.5 text-xs text-on-surface focus:ring-1 focus:ring-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-outline uppercase">To</label>
            <input
              type="datetime-local"
              name="to"
              defaultValue={to}
              className="w-full rounded-full border border-outline-variant/30 bg-surface-container-low px-3.5 py-1.5 text-xs text-on-surface focus:ring-1 focus:ring-primary focus:outline-none"
            />
          </div>
          <div className="flex items-end gap-2">
            <button type="submit" className="w-full rounded-full bg-primary px-3 py-2 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-container">
              Apply filters
            </button>
            <Link href="/audit" className="flex items-center justify-center gap-1 rounded-full bg-surface-container px-3 py-2 text-xs font-medium text-on-surface-variant transition-colors hover:text-primary">
              <span className="material-symbols-outlined text-base">filter_alt_off</span>
            </Link>
          </div>
        </form>
      </div>

      <div className="overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-surface-container-low">
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Outcome</TableHead>
              <TableHead>When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-sm text-on-surface-variant">No events match this filter.</TableCell>
              </TableRow>
            )}
            {events.map((event) => (
              <TableRow key={event.id} className="hover:bg-surface-container-low/60">
                <TableCell className="font-mono text-xs text-on-surface">{event.action}</TableCell>
                <TableCell className="text-xs text-on-surface-variant">{event.entityType}{event.entityId && ` #${event.entityId.slice(0, 8)}`}</TableCell>
                <TableCell className="text-xs text-on-surface-variant">{event.actorUserId ? (nameOf.get(event.actorUserId) ?? event.actorUserId) : "—"}</TableCell>
                <TableCell><StatusBadge status={event.outcome} tone={event.outcome === "SUCCESS" ? "positive" : event.outcome === "DENIED" ? "warning" : "critical"} /></TableCell>
                <TableCell className="text-xs text-on-surface-variant">{new Date(event.createdAt).toLocaleString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="flex items-center justify-between border-t border-outline-variant/20 bg-surface-container-low/40 p-4 text-xs text-on-surface-variant">
          <span>Showing {events.length} of {total} matching events (most recent {PAGE_SIZE})</span>
        </div>
      </div>
    </>
  );
}
