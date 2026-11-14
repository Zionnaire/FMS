import { requireSession } from "@/features/auth/session";
import { getContainmentRegister } from "@/features/containment/api";
import { CONTAINMENT_STATUSES, type ContainmentStatus } from "@/features/containment/types";
import { ContainmentTable } from "./containment-table";

function isStatus(value: string | undefined): value is ContainmentStatus {
  return !!value && (CONTAINMENT_STATUSES as readonly string[]).includes(value);
}

export default async function ContainmentPage(props: PageProps<"/containment">) {
  const searchParams = await props.searchParams;
  const status = isStatus(searchParams.status as string | undefined) ? (searchParams.status as ContainmentStatus) : undefined;
  const q = ((searchParams.q as string | undefined) || "").trim().toLowerCase();

  const { accessToken } = await requireSession();
  const allRows = await getContainmentRegister(accessToken);

  const byStatus = Object.fromEntries(CONTAINMENT_STATUSES.map((s) => [s, allRows.filter((r) => r.status === s).length])) as Record<ContainmentStatus, number>;

  const rows = allRows
    .filter((r) => !status || r.status === status)
    .filter((r) => !q || r.case.referenceCode.toLowerCase().includes(q) || r.case.title.toLowerCase().includes(q) || r.targetDescription.toLowerCase().includes(q));

  const preserved = new URLSearchParams();
  if (q) preserved.set("q", q);

  return (
    <>
      <div>
        <h1 className="font-headline text-2xl font-semibold text-primary">Containment</h1>
        <p className="mt-1 text-xs text-on-surface-variant">
          {allRows.length} request{allRows.length === 1 ? "" : "s"} — EFIMS only ever requests and waits for a positive confirmation, never acts itself.
        </p>
      </div>

      {/* KPI hero row */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col justify-between rounded-2xl border border-primary/20 bg-primary-container p-5 text-on-primary shadow-hero">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-secondary-fixed uppercase">Total requests</span>
            <span className="material-symbols-outlined text-secondary-fixed">block</span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-headline text-3xl font-bold text-surface-bright">{allRows.length}</span>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-5 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-error uppercase">Awaiting confirmation</span>
            <span className="rounded-xl bg-error-container p-2 text-on-error-container">
              <span className="material-symbols-outlined text-base">hourglass_top</span>
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-headline text-3xl font-bold text-error">{byStatus.REQUESTED}</span>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-5 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-outline uppercase">Confirmed</span>
            <span className="rounded-xl bg-tertiary-fixed p-2 text-tertiary">
              <span className="material-symbols-outlined text-base">check_circle</span>
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-headline text-3xl font-bold text-primary">{byStatus.CONFIRMED}</span>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-5 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-outline uppercase">Rejected / cancelled</span>
            <span className="rounded-xl bg-surface-container p-2 text-on-surface-variant">
              <span className="material-symbols-outlined text-base">cancel</span>
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-headline text-3xl font-bold text-primary">{byStatus.REJECTED + byStatus.CANCELLED}</span>
          </div>
        </div>
      </div>

      {/* Filter controls */}
      <div className="space-y-4 rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-5 shadow-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-outline-variant/20 pb-3">
          <a
            href={`/containment${q ? `?${preserved.toString()}` : ""}`}
            className={`rounded-full px-4 py-2 text-xs font-semibold transition-all ${!status ? "bg-primary text-on-primary" : "bg-surface-container text-on-surface-variant hover:text-on-surface"}`}
          >
            All requests <span className="ml-1 opacity-80">{allRows.length}</span>
          </a>
          {CONTAINMENT_STATUSES.map((s) => (
            <a
              key={s}
              href={`/containment?status=${s}${q ? `&${preserved.toString()}` : ""}`}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition-all ${status === s ? "bg-primary text-on-primary" : "bg-surface-container text-on-surface-variant hover:text-on-surface"}`}
            >
              {s} <span className="ml-1 opacity-80">{byStatus[s]}</span>
            </a>
          ))}
        </div>

        <form className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-3" action="/containment">
          {status && <input type="hidden" name="status" value={status} />}
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-outline uppercase">Search</label>
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Case reference, title, or target..."
              className="w-full rounded-full border border-outline-variant/30 bg-surface-container-low px-3.5 py-1.5 text-xs text-on-surface placeholder:text-outline/70 focus:ring-1 focus:ring-primary focus:outline-none"
            />
          </div>
          <div className="flex items-end gap-2">
            <button type="submit" className="w-full rounded-full bg-primary px-3 py-2 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-container">
              Apply filters
            </button>
            <a href="/containment" className="flex items-center justify-center gap-1 rounded-full bg-surface-container px-3 py-2 text-xs font-medium text-on-surface-variant transition-colors hover:text-primary">
              <span className="material-symbols-outlined text-base">filter_alt_off</span>
            </a>
          </div>
        </form>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-card">
        <ContainmentTable rows={rows} />
      </div>
    </>
  );
}
