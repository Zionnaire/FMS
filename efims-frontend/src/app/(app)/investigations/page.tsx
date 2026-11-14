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
        <h1 className="font-headline text-2xl font-semibold text-primary">Investigations</h1>
        <p className="mt-1 text-xs text-on-surface-variant">
          {allRows.length} case{allRows.length === 1 ? "" : "s"} with an investigation plan across every case you can access.
        </p>
      </div>

      {/* KPI hero row */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col justify-between rounded-2xl border border-primary/20 bg-primary-container p-5 text-on-primary shadow-hero">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-secondary-fixed uppercase">Active plans</span>
            <span className="material-symbols-outlined text-secondary-fixed">fact_check</span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-headline text-3xl font-bold text-surface-bright">{byStatus.ACTIVE}</span>
            <span className="rounded-full bg-secondary-container/30 px-2 py-0.5 text-xs font-medium text-secondary-fixed">in progress</span>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3 text-xs text-on-primary-container">
            <span>Across accessible cases</span>
            <span className="font-semibold text-secondary-fixed">{allRows.length} total</span>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-5 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-outline uppercase">Draft plans</span>
            <span className="rounded-xl bg-surface-container p-2 text-on-surface-variant">
              <span className="material-symbols-outlined text-base">edit_note</span>
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-headline text-3xl font-bold text-primary">{byStatus.DRAFT}</span>
            <span className="text-sm font-semibold text-on-surface">Not yet active</span>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-5 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-error uppercase">Open issues</span>
            <span className="rounded-xl bg-error-container p-2 text-on-error-container">
              <span className="material-symbols-outlined text-base">report</span>
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-headline text-3xl font-bold text-error">{totalOpenIssues}</span>
            <span className="text-sm font-semibold text-on-surface">Unresolved</span>
          </div>
          <p className="mt-1 text-xs text-on-surface-variant">Summed across every case&apos;s investigation issues</p>
        </div>

        <div className="flex flex-col justify-between rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-5 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-outline uppercase">Completed</span>
            <span className="rounded-xl bg-tertiary-fixed p-2 text-tertiary">
              <span className="material-symbols-outlined text-base">task_alt</span>
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-headline text-3xl font-bold text-primary">{byStatus.COMPLETED}</span>
          </div>
        </div>
      </div>

      {/* Filter controls */}
      <div className="space-y-4 rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-5 shadow-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-outline-variant/20 pb-3">
          <a
            href={`/investigations${q ? `?${preserved.toString()}` : ""}`}
            className={`rounded-full px-4 py-2 text-xs font-semibold transition-all ${!planStatus ? "bg-primary text-on-primary" : "bg-surface-container text-on-surface-variant hover:text-on-surface"}`}
          >
            All plans <span className="ml-1 opacity-80">{allRows.length}</span>
          </a>
          {INVESTIGATION_PLAN_STATUSES.map((s) => (
            <a
              key={s}
              href={`/investigations?planStatus=${s}${q ? `&${preserved.toString()}` : ""}`}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition-all ${planStatus === s ? "bg-primary text-on-primary" : "bg-surface-container text-on-surface-variant hover:text-on-surface"}`}
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
            <button type="submit" className="w-full rounded-full bg-primary px-3 py-2 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-container">
              Apply filters
            </button>
            <a href="/investigations" className="flex items-center justify-center gap-1 rounded-full bg-surface-container px-3 py-2 text-xs font-medium text-on-surface-variant transition-colors hover:text-primary">
              <span className="material-symbols-outlined text-base">filter_alt_off</span>
            </a>
          </div>
        </form>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-card">
        <InvestigationsTable rows={rows} />
      </div>
    </>
  );
}
