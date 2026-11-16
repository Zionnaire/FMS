import Link from "next/link";
import { ShieldCheck, ShieldAlert, CheckCircle2, Ban, AlertCircle, FilterX } from "lucide-react";
import { requireSession } from "@/features/auth/session";
import { getAuditStats, getAuditTrend, queryAuditEvents, verifyAuditChain } from "@/features/audit/api";
import { AUDIT_OUTCOMES, type AuditOutcome } from "@/features/audit/types";
import { listUsers, userDisplayNameMap } from "@/features/users/api";
import { ApiError } from "@/lib/backend-client";
import { StatusBadge } from "@/components/shell/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mono } from "@/components/ui/mono";
import { TrendChart } from "@/components/charts/trend-chart";

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

  const [chain, stats, trend, users] = await Promise.all([
    verifyAuditChain(accessToken),
    getAuditStats(accessToken),
    getAuditTrend(accessToken, 30),
    listUsers(accessToken),
  ]);
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
          <h1 className="text-2xl font-bold text-on-surface">Audit trail</h1>
          <p className="mt-1 text-xs text-on-surface-variant">{stats.total} events — append-only, tamper-evident hash chain.</p>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-3 rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-card">
          <div className="flex items-center gap-3">
            <span
              className="flex size-10 shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: `color-mix(in srgb, var(${chain.intact ? "--color-success" : "--color-error"}) 16%, white)` }}
            >
              {chain.intact ? <ShieldCheck size={20} strokeWidth={2} className="text-success" /> : <ShieldAlert size={20} strokeWidth={2} className="text-error" />}
            </span>
            <span className="text-xs font-semibold text-on-surface-variant">Hash chain</span>
          </div>
          <span className={`text-[28px] leading-none font-bold ${chain.intact ? "text-on-surface" : "text-error"}`}>{chain.intact ? "Intact" : "Broken"}</span>
          <p className="text-xs text-on-surface-variant">
            {chain.eventsChecked} events verified{chain.breaks.length > 0 && ` — ${chain.breaks.length} break${chain.breaks.length === 1 ? "" : "s"}`}
          </p>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-card">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--color-success) 16%, white)" }}>
              <CheckCircle2 size={20} strokeWidth={2} className="text-success" />
            </span>
            <span className="text-xs font-semibold text-on-surface-variant">Success</span>
          </div>
          <span className="text-[28px] leading-none font-bold text-on-surface">{stats.byOutcome.SUCCESS}</span>
          <p className="text-xs text-on-surface-variant">
            of {stats.total} total — <span className="font-semibold text-on-surface">{stats.total > 0 ? Math.round((stats.byOutcome.SUCCESS / stats.total) * 100) : 0}%</span>
          </p>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-card">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--color-secondary) 16%, white)" }}>
              <Ban size={20} strokeWidth={2} className="text-secondary" />
            </span>
            <span className="text-xs font-semibold text-on-surface-variant">Denied</span>
          </div>
          <span className="text-[28px] leading-none font-bold text-on-surface">{stats.byOutcome.DENIED}</span>
          <p className="text-xs text-on-surface-variant">Access-control denials — CLAUDE.md #6</p>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-card">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--color-error) 16%, white)" }}>
              <AlertCircle size={20} strokeWidth={2} className="text-error" />
            </span>
            <span className="text-xs font-semibold text-on-surface-variant">Failure</span>
          </div>
          <span className="text-[28px] leading-none font-bold text-on-surface">{stats.byOutcome.FAILURE}</span>
          <p className="text-xs text-on-surface-variant">Operation-level failures, not access denials</p>
        </div>
      </div>

      <Card className="border-outline-variant shadow-card">
        <CardHeader><CardTitle className="text-sm font-bold text-on-surface">Outcome trend — last 30 days</CardTitle></CardHeader>
        <CardContent>
          {trend.length === 0 ? (
            <p className="py-6 text-center text-xs text-on-surface-variant">No events in this window yet.</p>
          ) : (
            <TrendChart
              data={trend}
              series={[
                { key: "success", label: "Success", color: "var(--color-tertiary)" },
                { key: "denied", label: "Denied", color: "var(--color-secondary)" },
                { key: "failure", label: "Failure", color: "var(--color-error)" },
              ]}
            />
          )}
        </CardContent>
      </Card>

      {chain.breaks.length > 0 && (
        <div className="space-y-3 rounded-xl border border-error/30 bg-error-container/20 p-5 shadow-card">
          <div className="flex items-center gap-2">
            <ShieldAlert size={18} strokeWidth={2} className="text-error" />
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
      <div className="space-y-4 rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-card">
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
            <button type="submit" className="w-full rounded-full bg-tertiary px-3 py-2 text-xs font-semibold text-on-tertiary transition-colors hover:bg-tertiary/90">
              Apply filters
            </button>
            <Link href="/audit" className="flex items-center justify-center gap-1 rounded-full bg-surface-container px-3 py-2 text-xs font-medium text-on-surface-variant transition-colors hover:text-primary">
              <FilterX size={16} strokeWidth={2} />
            </Link>
          </div>
        </form>
      </div>

      <div className="overflow-hidden rounded-xl border border-outline-variant/60 bg-surface-container-lowest shadow-card">
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
                <TableCell><Mono className="text-on-surface">{event.action}</Mono></TableCell>
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
