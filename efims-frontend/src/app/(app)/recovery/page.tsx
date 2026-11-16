import { Landmark, PiggyBank, MinusCircle, Hourglass, FilterX } from "lucide-react";
import { requireSession } from "@/features/auth/session";
import { getRecoveryRegister } from "@/features/recovery/api";
import { RecoveryTable } from "./recovery-table";

function formatNgn(amount: string): string {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(Number(amount));
}

export default async function RecoveryPage(props: PageProps<"/recovery">) {
  const searchParams = await props.searchParams;
  const q = ((searchParams.q as string | undefined) || "").trim().toLowerCase();
  const outstandingOnly = searchParams.outstandingOnly === "true";

  const { accessToken } = await requireSession();
  const allRows = await getRecoveryRegister(accessToken);

  const totalLoss = allRows.reduce((sum, r) => sum + Number(r.totalLoss), 0);
  const totalRecovered = allRows.reduce((sum, r) => sum + Number(r.totalRecovered), 0);
  const totalWrittenOff = allRows.reduce((sum, r) => sum + Number(r.totalWrittenOff), 0);
  const totalOutstanding = allRows.reduce((sum, r) => sum + Number(r.outstanding), 0);
  const outstandingCaseCount = allRows.filter((r) => Number(r.outstanding) > 0).length;

  const rows = allRows
    .filter((r) => !outstandingOnly || Number(r.outstanding) > 0)
    .filter((r) => !q || r.referenceCode.toLowerCase().includes(q) || r.caseTitle.toLowerCase().includes(q));

  const preserved = new URLSearchParams();
  if (q) preserved.set("q", q);

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Recoveries</h1>
        <p className="mt-1 text-xs text-on-surface-variant">
          {allRows.length} case{allRows.length === 1 ? "" : "s"} with financial activity across every case you can access.
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-3 rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-card">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--color-tertiary) 16%, white)" }}>
              <Landmark size={20} strokeWidth={2} className="text-tertiary" />
            </span>
            <span className="text-xs font-semibold text-on-surface-variant">Total recorded loss</span>
          </div>
          <span className="text-2xl leading-none font-bold text-on-surface">{formatNgn(String(totalLoss))}</span>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-card">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--color-success) 16%, white)" }}>
              <PiggyBank size={20} strokeWidth={2} className="text-success" />
            </span>
            <span className="text-xs font-semibold text-on-surface-variant">Recovered</span>
          </div>
          <span className="text-xl leading-none font-bold text-on-surface">{formatNgn(String(totalRecovered))}</span>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-card">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--color-secondary) 16%, white)" }}>
              <MinusCircle size={20} strokeWidth={2} className="text-secondary" />
            </span>
            <span className="text-xs font-semibold text-on-surface-variant">Written off</span>
          </div>
          <span className="text-xl leading-none font-bold text-on-surface">{formatNgn(String(totalWrittenOff))}</span>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-card">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--color-error) 16%, white)" }}>
              <Hourglass size={20} strokeWidth={2} className="text-error" />
            </span>
            <span className="text-xs font-semibold text-on-surface-variant">Outstanding</span>
          </div>
          <span className="text-xl leading-none font-bold text-on-surface">{formatNgn(String(totalOutstanding))}</span>
          <p className="text-xs text-on-surface-variant">{outstandingCaseCount} case{outstandingCaseCount === 1 ? "" : "s"} still exposed</p>
        </div>
      </div>

      {/* Filter controls */}
      <div className="space-y-4 rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-outline-variant/20 pb-3">
          <a
            href={`/recovery${q ? `?${preserved.toString()}` : ""}`}
            className={`rounded-full px-4 py-2 text-xs font-semibold transition-all ${!outstandingOnly ? "bg-primary text-on-primary" : "bg-surface-container text-on-surface-variant hover:text-on-surface"}`}
          >
            All cases <span className="ml-1 opacity-80">{allRows.length}</span>
          </a>
          <a
            href={`/recovery?outstandingOnly=true${q ? `&${preserved.toString()}` : ""}`}
            className={`rounded-full px-4 py-2 text-xs font-semibold transition-all ${outstandingOnly ? "bg-primary text-on-primary" : "bg-surface-container text-on-surface-variant hover:text-on-surface"}`}
          >
            Still outstanding <span className="ml-1 opacity-80">{outstandingCaseCount}</span>
          </a>
        </div>

        <form className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-3" action="/recovery">
          {outstandingOnly && <input type="hidden" name="outstandingOnly" value="true" />}
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-outline uppercase">Search</label>
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Reference or case title..."
              className="w-full rounded-full border border-outline-variant/30 bg-surface-container-low px-3.5 py-1.5 text-xs text-on-surface placeholder:text-outline/70 focus:ring-1 focus:ring-primary focus:outline-none"
            />
          </div>
          <div className="flex items-end gap-2">
            <button type="submit" className="w-full rounded-full bg-tertiary px-3 py-2 text-xs font-semibold text-on-tertiary transition-colors hover:bg-tertiary/90">
              Apply filters
            </button>
            <a href="/recovery" className="flex items-center justify-center gap-1 rounded-full bg-surface-container px-3 py-2 text-xs font-medium text-on-surface-variant transition-colors hover:text-primary">
              <FilterX size={16} strokeWidth={2} />
            </a>
          </div>
        </form>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-outline-variant/60 bg-surface-container-lowest shadow-card">
        <RecoveryTable rows={rows} />
      </div>
    </>
  );
}
