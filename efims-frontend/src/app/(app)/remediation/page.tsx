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
        <h1 className="font-headline text-2xl font-semibold text-primary">Remediation</h1>
        <p className="mt-1 text-xs text-on-surface-variant">
          {allRows.length} CAPA action{allRows.length === 1 ? "" : "s"} across every case you can access.
        </p>
      </div>

      {/* KPI hero row */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col justify-between rounded-2xl border border-primary/20 bg-primary-container p-5 text-on-primary shadow-hero">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-secondary-fixed uppercase">Total actions</span>
            <span className="material-symbols-outlined text-secondary-fixed">build_circle</span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-headline text-3xl font-bold text-surface-bright">{allRows.length}</span>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-5 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-outline uppercase">In progress</span>
            <span className="rounded-xl bg-surface-container p-2 text-on-surface-variant">
              <span className="material-symbols-outlined text-base">pending</span>
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-headline text-3xl font-bold text-primary">{byStatus.OPEN + byStatus.IN_PROGRESS}</span>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-5 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-error uppercase">Overdue</span>
            <span className="rounded-xl bg-error-container p-2 text-on-error-container">
              <span className="material-symbols-outlined text-base">warning</span>
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-headline text-3xl font-bold text-error">{overdueCount}</span>
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
            <span className="font-headline text-3xl font-bold text-primary">{byStatus.VALIDATED}</span>
          </div>
        </div>
      </div>

      {/* Filter controls */}
      <div className="space-y-4 rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-5 shadow-card">
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
            <button type="submit" className="w-full rounded-full bg-primary px-3 py-2 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-container">
              Apply filters
            </button>
            <a href="/remediation" className="flex items-center justify-center gap-1 rounded-full bg-surface-container px-3 py-2 text-xs font-medium text-on-surface-variant transition-colors hover:text-primary">
              <span className="material-symbols-outlined text-base">filter_alt_off</span>
            </a>
          </div>
        </form>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-card">
        <RemediationTable rows={rows} />
      </div>
    </>
  );
}
