import { Wrench, Clock, AlertTriangle, CheckCircle2, FilterX } from "lucide-react";
import { requireSession } from "@/features/auth/session";
import { getCapaRegister } from "@/features/capa/api";
import { CAPA_ACTION_STATUSES, type CapaActionStatus } from "@/features/capa/types";
import { isPastDeadline } from "@/lib/time";
import { RemediationTable } from "./remediation-table";

function isStatus(value: string | undefined): value is CapaActionStatus {
  return !!value && (CAPA_ACTION_STATUSES as readonly string[]).includes(value);
}

export default async function RemediationPage(props: PageProps<"/remediation">) {
  const searchParams = await props.searchParams;
  const status = isStatus(searchParams.status as string | undefined) ? (searchParams.status as CapaActionStatus) : undefined;
  const q = ((searchParams.q as string | undefined) || "").trim().toLowerCase();

  const { accessToken } = await requireSession();
  const allRows = await getCapaRegister(accessToken);

  const byStatus = Object.fromEntries(CAPA_ACTION_STATUSES.map((s) => [s, allRows.filter((r) => r.status === s).length])) as Record<CapaActionStatus, number>;
  const overdueCount = allRows.filter((r) => (r.status === "OPEN" || r.status === "IN_PROGRESS") && isPastDeadline(r.dueDate)).length;

  const rows = allRows
    .filter((r) => !status || r.status === status)
    .filter((r) => !q || r.title.toLowerCase().includes(q) || r.case.referenceCode.toLowerCase().includes(q) || r.case.title.toLowerCase().includes(q));

  const preserved = new URLSearchParams();
  if (q) preserved.set("q", q);

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Remediation</h1>
        <p className="mt-1 text-xs text-on-surface-variant">
          {allRows.length} CAPA action{allRows.length === 1 ? "" : "s"} across every case you can access.
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-3 rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-card">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--color-tertiary) 16%, white)" }}>
              <Wrench size={20} strokeWidth={2} className="text-tertiary" />
            </span>
            <span className="text-xs font-semibold text-on-surface-variant">Total actions</span>
          </div>
          <span className="text-[28px] leading-none font-bold text-on-surface">{allRows.length}</span>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-card">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--color-secondary) 16%, white)" }}>
              <Clock size={20} strokeWidth={2} className="text-secondary" />
            </span>
            <span className="text-xs font-semibold text-on-surface-variant">In progress</span>
          </div>
          <span className="text-[28px] leading-none font-bold text-on-surface">{byStatus.OPEN + byStatus.IN_PROGRESS}</span>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-card">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--color-error) 16%, white)" }}>
              <AlertTriangle size={20} strokeWidth={2} className="text-error" />
            </span>
            <span className="text-xs font-semibold text-on-surface-variant">Overdue</span>
          </div>
          <span className="text-[28px] leading-none font-bold text-on-surface">{overdueCount}</span>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-card">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--color-success) 16%, white)" }}>
              <CheckCircle2 size={20} strokeWidth={2} className="text-success" />
            </span>
            <span className="text-xs font-semibold text-on-surface-variant">Validated</span>
          </div>
          <span className="text-[28px] leading-none font-bold text-on-surface">{byStatus.VALIDATED}</span>
        </div>
      </div>

      {/* Filter controls */}
      <div className="space-y-4 rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-outline-variant/20 pb-3">
          <a
            href={`/remediation${q ? `?${preserved.toString()}` : ""}`}
            className={`rounded-full px-4 py-2 text-xs font-semibold transition-all ${!status ? "bg-primary text-on-primary" : "bg-surface-container text-on-surface-variant hover:text-on-surface"}`}
          >
            All actions <span className="ml-1 opacity-80">{allRows.length}</span>
          </a>
          {CAPA_ACTION_STATUSES.map((s) => (
            <a
              key={s}
              href={`/remediation?status=${s}${q ? `&${preserved.toString()}` : ""}`}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition-all ${status === s ? "bg-primary text-on-primary" : "bg-surface-container text-on-surface-variant hover:text-on-surface"}`}
            >
              {s.replaceAll("_", " ")} <span className="ml-1 opacity-80">{byStatus[s]}</span>
            </a>
          ))}
        </div>

        <form className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-3" action="/remediation">
          {status && <input type="hidden" name="status" value={status} />}
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-outline uppercase">Search</label>
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Title, case reference, or case title..."
              className="w-full rounded-full border border-outline-variant/30 bg-surface-container-low px-3.5 py-1.5 text-xs text-on-surface placeholder:text-outline/70 focus:ring-1 focus:ring-primary focus:outline-none"
            />
          </div>
          <div className="flex items-end gap-2">
            <button type="submit" className="w-full rounded-full bg-tertiary px-3 py-2 text-xs font-semibold text-on-tertiary transition-colors hover:bg-tertiary/90">
              Apply filters
            </button>
            <a href="/remediation" className="flex items-center justify-center gap-1 rounded-full bg-surface-container px-3 py-2 text-xs font-medium text-on-surface-variant transition-colors hover:text-primary">
              <FilterX size={16} strokeWidth={2} />
            </a>
          </div>
        </form>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-outline-variant/60 bg-surface-container-lowest shadow-card">
        <RemediationTable rows={rows} />
      </div>
    </>
  );
}
