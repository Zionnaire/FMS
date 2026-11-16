import { ClipboardCheck, Pencil, AlertCircle, CheckCircle2, FilterX } from "lucide-react";
import { requireSession } from "@/features/auth/session";
import { getInvestigationsRegister } from "@/features/investigations/api";
import { INVESTIGATION_PLAN_STATUSES, type InvestigationPlanStatus } from "@/features/investigations/types";
import { InvestigationsTable } from "./investigations-table";

function isPlanStatus(value: string | undefined): value is InvestigationPlanStatus {
  return !!value && (INVESTIGATION_PLAN_STATUSES as readonly string[]).includes(value);
}

export default async function InvestigationsPage(props: PageProps<"/investigations">) {
  const searchParams = await props.searchParams;
  const planStatus = isPlanStatus(searchParams.planStatus as string | undefined) ? (searchParams.planStatus as InvestigationPlanStatus) : undefined;
  const q = ((searchParams.q as string | undefined) || "").trim().toLowerCase();

  const { accessToken } = await requireSession();
  const allRows = await getInvestigationsRegister(accessToken);

  const byStatus = {
    DRAFT: allRows.filter((r) => r.planStatus === "DRAFT").length,
    ACTIVE: allRows.filter((r) => r.planStatus === "ACTIVE").length,
    COMPLETED: allRows.filter((r) => r.planStatus === "COMPLETED").length,
  };
  const totalOpenIssues = allRows.reduce((sum, r) => sum + r.openIssueCount, 0);

  const rows = allRows
    .filter((r) => !planStatus || r.planStatus === planStatus)
    .filter((r) => !q || r.referenceCode.toLowerCase().includes(q) || r.caseTitle.toLowerCase().includes(q) || r.objectives.toLowerCase().includes(q));

  const preserved = new URLSearchParams();
  if (q) preserved.set("q", q);

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Investigations</h1>
        <p className="mt-1 text-xs text-on-surface-variant">
          {allRows.length} case{allRows.length === 1 ? "" : "s"} with an investigation plan across every case you can access.
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-3 rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-card">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--color-tertiary) 16%, white)" }}>
              <ClipboardCheck size={20} strokeWidth={2} className="text-tertiary" />
            </span>
            <span className="text-xs font-semibold text-on-surface-variant">Active plans</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-[28px] leading-none font-bold text-on-surface">{byStatus.ACTIVE}</span>
            <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-xs font-medium text-on-surface-variant">in progress</span>
          </div>
          <p className="text-xs text-on-surface-variant">{allRows.length} total across accessible cases</p>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-card">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--color-secondary) 16%, white)" }}>
              <Pencil size={20} strokeWidth={2} className="text-secondary" />
            </span>
            <span className="text-xs font-semibold text-on-surface-variant">Draft plans</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-[28px] leading-none font-bold text-on-surface">{byStatus.DRAFT}</span>
            <span className="text-sm font-semibold text-on-surface">Not yet active</span>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-card">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--color-error) 16%, white)" }}>
              <AlertCircle size={20} strokeWidth={2} className="text-error" />
            </span>
            <span className="text-xs font-semibold text-on-surface-variant">Open issues</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-[28px] leading-none font-bold text-on-surface">{totalOpenIssues}</span>
            <span className="text-sm font-semibold text-on-surface">Unresolved</span>
          </div>
          <p className="text-xs text-on-surface-variant">Summed across every case&apos;s investigation issues</p>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-card">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--color-success) 16%, white)" }}>
              <CheckCircle2 size={20} strokeWidth={2} className="text-success" />
            </span>
            <span className="text-xs font-semibold text-on-surface-variant">Completed</span>
          </div>
          <span className="text-[28px] leading-none font-bold text-on-surface">{byStatus.COMPLETED}</span>
        </div>
      </div>

      {/* Filter controls */}
      <div className="space-y-4 rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-outline-variant/20 pb-3">
          <a
            href={`/investigations${q ? `?${preserved.toString()}` : ""}`}
            className={`rounded-full px-4 py-2 text-xs font-semibold transition-all ${!planStatus ? "bg-tertiary text-on-tertiary" : "bg-surface-container text-on-surface-variant hover:text-on-surface"}`}
          >
            All plans <span className="ml-1 opacity-80">{allRows.length}</span>
          </a>
          {INVESTIGATION_PLAN_STATUSES.map((s) => (
            <a
              key={s}
              href={`/investigations?planStatus=${s}${q ? `&${preserved.toString()}` : ""}`}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition-all ${planStatus === s ? "bg-tertiary text-on-tertiary" : "bg-surface-container text-on-surface-variant hover:text-on-surface"}`}
            >
              {s} <span className="ml-1 opacity-80">{byStatus[s]}</span>
            </a>
          ))}
        </div>

        <form className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-3" action="/investigations">
          {planStatus && <input type="hidden" name="planStatus" value={planStatus} />}
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-outline uppercase">Search</label>
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Reference, title, or objectives..."
              className="w-full rounded-full border border-outline-variant/30 bg-surface-container-low px-3.5 py-1.5 text-xs text-on-surface placeholder:text-outline/70 focus:ring-1 focus:ring-primary focus:outline-none"
            />
          </div>
          <div className="flex items-end gap-2">
            <button type="submit" className="w-full rounded-full bg-tertiary px-3 py-2 text-xs font-semibold text-on-tertiary transition-colors hover:bg-tertiary/90">
              Apply filters
            </button>
            <a href="/investigations" className="flex items-center justify-center gap-1 rounded-full bg-surface-container px-3 py-2 text-xs font-medium text-on-surface-variant transition-colors hover:text-primary">
              <FilterX size={16} strokeWidth={2} />
            </a>
          </div>
        </form>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-outline-variant/60 bg-surface-container-lowest shadow-card">
        <InvestigationsTable rows={rows} />
      </div>
    </>
  );
}
