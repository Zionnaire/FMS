import Link from "next/link";
import { AlertTriangle, Link2, Lock, CheckCircle2, FilterX, ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { requireSession } from "@/features/auth/session";
import { listIncidents, getIncidentStats } from "@/features/incidents/api";
import { INCIDENT_STATUSES, type IncidentStatus } from "@/features/incidents/types";
import { COMPARTMENTS, type Compartment } from "@/features/auth/types";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const PAGE_SIZE = 20;

const STATUS_TONE: Record<IncidentStatus, "positive" | "warning" | "critical" | "neutral"> = {
  OPEN: "warning",
  UNDER_REVIEW: "warning",
  LINKED_TO_CASE: "positive",
  MERGED: "neutral",
  REJECTED: "critical",
  CLOSED_NO_CASE: "neutral",
};
const STATUS_TONE_CLASSES: Record<string, string> = {
  positive: "bg-tertiary-fixed text-on-tertiary-fixed-variant",
  warning: "bg-secondary-container text-on-secondary-container",
  critical: "bg-error-container text-on-error-container",
  neutral: "bg-surface-container-high text-on-surface-variant",
};

function isIncidentStatus(value: string | undefined): value is IncidentStatus {
  return !!value && (INCIDENT_STATUSES as readonly string[]).includes(value);
}

function isCompartment(value: string | undefined): value is Compartment {
  return !!value && (COMPARTMENTS as readonly string[]).includes(value);
}

/** Exported separately from the default page export so `/intake`'s Incidents tab can render this
 * exact content as a tab panel without duplicating any data-fetching — see that page's own doc
 * comment. */
export async function IncidentsPageContent(searchParams: { [key: string]: string | string[] | undefined }) {
  const status = isIncidentStatus(searchParams.status as string | undefined) ? (searchParams.status as IncidentStatus) : undefined;
  const compartment = isCompartment(searchParams.compartment as string | undefined) ? (searchParams.compartment as Compartment) : undefined;
  const q = (searchParams.q as string | undefined) || undefined;
  const offset = Number(searchParams.offset) || 0;

  const { accessToken } = await requireSession();
  const [{ incidents, total }, stats] = await Promise.all([
    listIncidents({ accessToken, status, compartment, q, limit: PAGE_SIZE, offset }),
    getIncidentStats(accessToken),
  ]);

  const activeParams = new URLSearchParams();
  if (compartment) activeParams.set("compartment", compartment);
  if (q) activeParams.set("q", q);
  const preserved = activeParams.toString();

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Incidents</h1>
        <p className="mt-1 text-xs text-on-surface-variant">{stats.total} accessible, filtered by compartment visibility.</p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-3 rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-card">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--color-tertiary) 16%, white)" }}>
              <AlertTriangle size={20} strokeWidth={2} className="text-tertiary" />
            </span>
            <span className="text-xs font-semibold text-on-surface-variant">Operational queue</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-[28px] leading-none font-bold text-on-surface">{stats.total}</span>
            <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-xs font-medium text-on-surface-variant">
              {stats.byStatus.OPEN} open
            </span>
          </div>
          <p className="text-xs text-on-surface-variant">{stats.byStatus.UNDER_REVIEW} under review</p>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-card">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--color-info) 16%, white)" }}>
              <Link2 size={20} strokeWidth={2} className="text-info" />
            </span>
            <span className="text-xs font-semibold text-on-surface-variant">Case pipeline</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-[28px] leading-none font-bold text-on-surface">{stats.linkedToCaseCount}</span>
            <span className="text-sm font-semibold text-on-surface">Linked</span>
          </div>
          <p className="text-xs text-on-surface-variant">
            {stats.total > 0 ? Math.round((stats.linkedToCaseCount / stats.total) * 100) : 0}% incident → case rate
          </p>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-card">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--color-error) 16%, white)" }}>
              <Lock size={20} strokeWidth={2} className="text-error" />
            </span>
            <span className="text-xs font-semibold text-on-surface-variant">Restricted access</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-[28px] leading-none font-bold text-on-surface">{stats.restrictedCompartmentCount}</span>
            <span className="text-sm font-semibold text-on-surface">Compartmented</span>
          </div>
          <p className="text-xs text-on-surface-variant">Outside STANDARD, requires an explicit grant</p>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-card">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--color-success) 16%, white)" }}>
              <CheckCircle2 size={20} strokeWidth={2} className="text-success" />
            </span>
            <span className="text-xs font-semibold text-on-surface-variant">Closed / resolved</span>
          </div>
          <span className="text-[28px] leading-none font-bold text-on-surface">{stats.byStatus.CLOSED_NO_CASE + stats.byStatus.REJECTED + stats.byStatus.MERGED}</span>
          <p className="text-xs text-on-surface-variant">{stats.byStatus.REJECTED} rejected, closed without a case, or merged</p>
        </div>
      </div>

      {/* Filter controls */}
      <div className="space-y-4 rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-outline-variant/20 pb-3">
          <Link
            href={`/incidents${preserved ? `?${preserved}` : ""}`}
            className={`rounded-full px-4 py-2 text-xs font-semibold transition-all ${!status ? "bg-tertiary text-on-tertiary" : "bg-surface-container text-on-surface-variant hover:text-on-surface"}`}
          >
            All incidents <span className="ml-1 opacity-80">{stats.total}</span>
          </Link>
          {INCIDENT_STATUSES.map((s) => (
            <Link
              key={s}
              href={`/incidents?status=${s}${preserved ? `&${preserved}` : ""}`}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition-all ${status === s ? "bg-tertiary text-on-tertiary" : "bg-surface-container text-on-surface-variant hover:text-on-surface"}`}
            >
              {s.replaceAll("_", " ")} <span className="ml-1 opacity-80">{stats.byStatus[s]}</span>
            </Link>
          ))}
        </div>

        <form className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-3" action="/incidents">
          {status && <input type="hidden" name="status" value={status} />}
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-outline uppercase">Search</label>
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Reference, title, category, type..."
              className="w-full rounded-full border border-outline-variant/30 bg-surface-container-low px-3.5 py-1.5 text-xs text-on-surface placeholder:text-outline/70 focus:ring-1 focus:ring-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-outline uppercase">Compartment</label>
            <select
              name="compartment"
              defaultValue={compartment ?? ""}
              className="w-full cursor-pointer rounded-full border border-outline-variant/30 bg-surface-container-low px-3.5 py-1.5 text-xs text-on-surface focus:ring-1 focus:ring-primary focus:outline-none"
            >
              <option value="">All compartments</option>
              {COMPARTMENTS.map((c) => (
                <option key={c} value={c}>{c.replaceAll("_", " ")}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button type="submit" className="w-full rounded-full bg-tertiary px-3 py-2 text-xs font-semibold text-on-tertiary transition-colors hover:bg-tertiary/90">
              Apply filters
            </button>
            <Link href="/incidents" className="flex items-center justify-center gap-1 rounded-full bg-surface-container px-3 py-2 text-xs font-medium text-on-surface-variant transition-colors hover:text-primary">
              <FilterX size={16} strokeWidth={2} />
            </Link>
          </div>
        </form>
      </div>

      <div className="overflow-hidden rounded-xl border border-outline-variant/60 bg-surface-container-lowest shadow-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-surface-container-low">
              <TableHead>Reference &amp; title</TableHead>
              <TableHead>Category / Type</TableHead>
              <TableHead>Compartment</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Reported</TableHead>
              <TableHead className="text-center">Open</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {incidents.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-on-surface-variant">
                  No incidents match this filter.
                </TableCell>
              </TableRow>
            )}
            {incidents.map((incident) => (
              <TableRow key={incident.id} className="hover:bg-surface-container-low/60">
                <TableCell>
                  <div className="flex flex-col">
                    <span className="w-fit rounded bg-surface-container px-2 py-0.5 font-mono text-xs font-bold text-primary">
                      {incident.referenceCode}
                    </span>
                    <Link href={`/incidents/${incident.id}`} className="mt-1 text-sm font-semibold text-on-surface hover:text-primary hover:underline">
                      {incident.title}
                    </Link>
                    {incident.caseId && (
                      <Link href={`/cases/${incident.caseId}`} className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-tertiary hover:underline">
                        <Link2 size={12} strokeWidth={2} /> View linked case
                      </Link>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <p className="text-sm text-on-surface">{incident.category}</p>
                  <p className="text-xs text-on-surface-variant">{incident.type}</p>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="border-outline-variant text-on-surface-variant">
                    {incident.compartment}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge className={STATUS_TONE_CLASSES[STATUS_TONE[incident.status]]}>{incident.status.replaceAll("_", " ")}</Badge>
                </TableCell>
                <TableCell className="text-xs text-on-surface-variant">
                  {new Date(incident.occurredAt ?? incident.createdAt).toLocaleString()}
                </TableCell>
                <TableCell className="text-center">
                  <Link href={`/incidents/${incident.id}`} className="inline-flex rounded-full p-1.5 text-primary transition-colors hover:bg-surface-container" title="Open incident">
                    <Eye size={16} strokeWidth={2} />
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="flex flex-col items-center justify-between gap-3 border-t border-outline-variant/20 bg-surface-container-low/40 p-4 sm:flex-row">
          <div className="text-xs text-on-surface-variant">
            Showing <span className="font-semibold text-on-surface">{incidents.length === 0 ? 0 : offset + 1}-{offset + incidents.length}</span> of{" "}
            <span className="font-semibold text-on-surface">{total}</span> incidents
          </div>
          <div className="flex items-center gap-2">
            <Link
              aria-disabled={offset === 0}
              href={`/incidents?${new URLSearchParams({ ...(status ? { status } : {}), ...(preserved ? Object.fromEntries(activeParams) : {}), offset: String(Math.max(0, offset - PAGE_SIZE)) })}`}
              className={`rounded-full border border-outline-variant/30 p-1.5 text-outline transition-colors ${offset === 0 ? "pointer-events-none opacity-40" : "hover:bg-surface-container"}`}
            >
              <ChevronLeft size={16} strokeWidth={2} />
            </Link>
            <Link
              aria-disabled={offset + PAGE_SIZE >= total}
              href={`/incidents?${new URLSearchParams({ ...(status ? { status } : {}), ...(preserved ? Object.fromEntries(activeParams) : {}), offset: String(offset + PAGE_SIZE) })}`}
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

export default async function IncidentsPage(props: PageProps<"/incidents">) {
  const searchParams = await props.searchParams;
  return IncidentsPageContent(searchParams);
}
