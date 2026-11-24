import { ShieldCheck, Hourglass, CheckCircle2, XCircle, FilterX } from "lucide-react";
import { requireSession } from "@/features/auth/session";
import { getApprovalsRegister } from "@/features/workflow/api";
import { APPROVAL_STATUSES, type ApprovalStatus } from "@/features/workflow/types";
import { ApprovalsTable } from "./approvals-table";

function isStatus(value: string | undefined): value is ApprovalStatus {
  return !!value && (APPROVAL_STATUSES as readonly string[]).includes(value);
}

export default async function ApprovalsPage(props: PageProps<"/approvals">) {
  const searchParams = await props.searchParams;
  const status = isStatus(searchParams.status as string | undefined) ? (searchParams.status as ApprovalStatus) : undefined;
  const q = ((searchParams.q as string | undefined) || "").trim().toLowerCase();

  const { accessToken } = await requireSession();
  const allRows = await getApprovalsRegister(accessToken);

  const byStatus = Object.fromEntries(APPROVAL_STATUSES.map((s) => [s, allRows.filter((r) => r.status === s).length])) as Record<ApprovalStatus, number>;

  const rows = allRows
    .filter((r) => !status || r.status === status)
    .filter((r) => !q || r.case.referenceCode.toLowerCase().includes(q) || r.case.title.toLowerCase().includes(q) || r.requestNotes.toLowerCase().includes(q));

  const preserved = new URLSearchParams();
  if (q) preserved.set("q", q);

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Approvals</h1>
        <p className="mt-1 text-xs text-on-surface-variant">
          {allRows.length} request{allRows.length === 1 ? "" : "s"} across every case you can access. Governed by CD-04&apos;s approval matrix, with segregation of duties enforced.
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-3 rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-card">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--color-tertiary) 16%, white)" }}>
              <ShieldCheck size={20} strokeWidth={2} className="text-tertiary" />
            </span>
            <span className="text-xs font-semibold text-on-surface-variant">Total requests</span>
          </div>
          <span className="text-[28px] leading-none font-bold text-on-surface">{allRows.length}</span>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-card">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--color-error) 16%, white)" }}>
              <Hourglass size={20} strokeWidth={2} className="text-error" />
            </span>
            <span className="text-xs font-semibold text-on-surface-variant">Pending</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-[28px] leading-none font-bold text-on-surface">{byStatus.PENDING}</span>
            <span className="text-xs font-semibold text-error">Needs a decision</span>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-card">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--color-success) 16%, white)" }}>
              <CheckCircle2 size={20} strokeWidth={2} className="text-success" />
            </span>
            <span className="text-xs font-semibold text-on-surface-variant">Approved</span>
          </div>
          <span className="text-[28px] leading-none font-bold text-on-surface">{byStatus.APPROVED}</span>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-card">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--color-secondary) 16%, white)" }}>
              <XCircle size={20} strokeWidth={2} className="text-secondary" />
            </span>
            <span className="text-xs font-semibold text-on-surface-variant">Rejected</span>
          </div>
          <span className="text-[28px] leading-none font-bold text-on-surface">{byStatus.REJECTED}</span>
        </div>
      </div>

      {/* Filter controls */}
      <div className="space-y-4 rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-outline-variant/20 pb-3">
          <a
            href={`/approvals${q ? `?${preserved.toString()}` : ""}`}
            className={`rounded-full px-4 py-2 text-xs font-semibold transition-all ${!status ? "bg-primary text-on-primary" : "bg-surface-container text-on-surface-variant hover:text-on-surface"}`}
          >
            All requests <span className="ml-1 opacity-80">{allRows.length}</span>
          </a>
          {APPROVAL_STATUSES.map((s) => (
            <a
              key={s}
              href={`/approvals?status=${s}${q ? `&${preserved.toString()}` : ""}`}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition-all ${status === s ? "bg-primary text-on-primary" : "bg-surface-container text-on-surface-variant hover:text-on-surface"}`}
            >
              {s} <span className="ml-1 opacity-80">{byStatus[s]}</span>
            </a>
          ))}
        </div>

        <form className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-3" action="/approvals">
          {status && <input type="hidden" name="status" value={status} />}
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-outline uppercase">Search</label>
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Case reference, title, or notes..."
              className="w-full rounded-full border border-outline-variant/30 bg-surface-container-low px-3.5 py-1.5 text-xs text-on-surface placeholder:text-outline/70 focus:ring-1 focus:ring-primary focus:outline-none"
            />
          </div>
          <div className="flex items-end gap-2">
            <button type="submit" className="w-full rounded-full bg-tertiary px-3 py-2 text-xs font-semibold text-on-tertiary transition-colors hover:bg-tertiary/90">
              Apply filters
            </button>
            <a href="/approvals" className="flex items-center justify-center gap-1 rounded-full bg-surface-container px-3 py-2 text-xs font-medium text-on-surface-variant transition-colors hover:text-primary">
              <FilterX size={16} strokeWidth={2} />
            </a>
          </div>
        </form>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-outline-variant/60 bg-surface-container-lowest shadow-card">
        <ApprovalsTable rows={rows} />
      </div>
    </>
  );
}
