import Link from "next/link";
import { requireSession } from "@/features/auth/session";
import { listCases, getCaseStats } from "@/features/cases/api";
import { CASE_STATUSES, type CaseStatus } from "@/features/cases/types";
import { COMPARTMENTS, type Compartment } from "@/features/auth/types";
import { CasesTable } from "./cases-table";

const PAGE_SIZE = 20;
const SENSITIVITY_LEVELS = [1, 2, 3, 4] as const;

function isCaseStatus(value: string | undefined): value is CaseStatus {
  return !!value && (CASE_STATUSES as readonly string[]).includes(value);
}

function isCompartment(value: string | undefined): value is Compartment {
  return !!value && (COMPARTMENTS as readonly string[]).includes(value);
}

function formatNgn(amount: string): string {
  const n = Number(amount);
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(n);
}

export default async function CasesPage(props: PageProps<"/cases">) {
  const searchParams = await props.searchParams;
  const status = isCaseStatus(searchParams.status as string | undefined) ? (searchParams.status as CaseStatus) : undefined;
  const compartment = isCompartment(searchParams.compartment as string | undefined) ? (searchParams.compartment as Compartment) : undefined;
  const sensitivityLevel = Number(searchParams.sensitivityLevel) || undefined;
  const q = (searchParams.q as string | undefined) || undefined;
  const offset = Number(searchParams.offset) || 0;

  const { accessToken } = await requireSession();
  const [{ cases, total }, stats] = await Promise.all([
    listCases({ accessToken, status, compartment, sensitivityLevel, q, limit: PAGE_SIZE, offset }),
    getCaseStats(accessToken),
  ]);

  const activeParams = new URLSearchParams();
  if (compartment) activeParams.set("compartment", compartment);
  if (sensitivityLevel) activeParams.set("sensitivityLevel", String(sensitivityLevel));
  if (q) activeParams.set("q", q);
  const preserved = activeParams.toString();

  return (
    <>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="font-headline text-2xl font-semibold text-primary">Cases</h1>
          <p className="mt-1 text-xs text-on-surface-variant">
            {stats.total} accessible under the 7-condition case-access rule — tenant, role, team, subject/conflict, clearance, compartment.
          </p>
        </div>
        <Link href="/cases/new" className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-xs font-semibold text-on-primary shadow-card transition-all hover:bg-primary-container">
          <span className="material-symbols-outlined text-base">add_box</span>
          New case
        </Link>
      </div>

      {/* KPI hero row */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col justify-between rounded-2xl border border-primary/20 bg-primary-container p-5 text-on-primary shadow-hero">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-secondary-fixed uppercase">Live caseload</span>
            <span className="material-symbols-outlined text-secondary-fixed">account_tree</span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-headline text-3xl font-bold text-surface-bright">{stats.total}</span>
            <span className="rounded-full bg-secondary-container/30 px-2 py-0.5 text-xs font-medium text-secondary-fixed">
              {stats.byStatus.OPEN} open
            </span>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3 text-xs text-on-primary-container">
            <span>Accessible master cases</span>
            <span className="font-semibold text-secondary-fixed">{stats.byStatus.UNDER_INVESTIGATION} under investigation</span>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-5 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-outline uppercase">Financial scope</span>
            <span className="rounded-xl bg-secondary-container/30 p-2 text-secondary">
              <span className="material-symbols-outlined text-base">account_balance</span>
            </span>
          </div>
          <div className="mt-3">
            <div className="font-headline text-xl font-bold tracking-tight text-primary">{formatNgn(stats.outstanding)}</div>
            <div className="mt-0.5 text-xs text-on-surface-variant">Outstanding of {formatNgn(stats.totalLoss)} recorded loss</div>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-outline-variant/20 pt-3 text-xs text-on-surface-variant">
            <span>Disputed exposure</span>
            <span className="font-bold text-tertiary-fixed-dim">{formatNgn(stats.totalRecovered)} recovered</span>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-5 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-error uppercase">Compliance risk</span>
            <span className="rounded-xl bg-error-container p-2 text-on-error-container">
              <span className="material-symbols-outlined text-base">hourglass_top</span>
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-headline text-3xl font-bold text-error">{stats.pendingApprovals}</span>
            <span className="text-sm font-semibold text-on-surface">Pending</span>
          </div>
          <p className="mt-1 text-xs text-on-surface-variant">Approval requests awaiting a decision</p>
          <div className="mt-4 flex items-center justify-between border-t border-outline-variant/20 pt-3 text-xs text-on-surface-variant">
            <span>Statutory approval queue</span>
            <span className="flex items-center gap-1 font-semibold text-error">
              <span className="h-2 w-2 rounded-full bg-error" /> {stats.pendingApprovals > 0 ? "Needs attention" : "Clear"}
            </span>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-5 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-outline uppercase">Sensitivity</span>
            <span className="rounded-xl bg-tertiary-fixed p-2 text-tertiary">
              <span className="material-symbols-outlined text-base">shield</span>
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-headline text-3xl font-bold text-primary">{stats.highSensitivityCount}</span>
            <span className="rounded-full bg-tertiary-fixed/40 px-2 py-0.5 text-xs font-semibold text-tertiary">Tier 4</span>
          </div>
          <p className="mt-1 text-xs text-on-surface-variant">Highest-clearance cases in view</p>
          <div className="mt-4 flex items-center justify-between border-t border-outline-variant/20 pt-3 text-xs text-on-surface-variant">
            <span>Executive / MLRO tier</span>
            <span className="font-semibold text-primary">{stats.byStatus.CLOSED} closed</span>
          </div>
        </div>
      </div>

      {/* Filter controls */}
      <div className="space-y-4 rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-5 shadow-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-outline-variant/20 pb-3">
          <Link
            href={`/cases${preserved ? `?${preserved}` : ""}`}
            className={`rounded-full px-4 py-2 text-xs font-semibold transition-all ${!status ? "bg-primary text-on-primary" : "bg-surface-container text-on-surface-variant hover:text-on-surface"}`}
          >
            All cases <span className="ml-1 opacity-80">{stats.total}</span>
          </Link>
          {CASE_STATUSES.map((s) => (
            <Link
              key={s}
              href={`/cases?status=${s}${preserved ? `&${preserved}` : ""}`}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition-all ${status === s ? "bg-primary text-on-primary" : "bg-surface-container text-on-surface-variant hover:text-on-surface"}`}
            >
              {s.replaceAll("_", " ")} <span className="ml-1 opacity-80">{stats.byStatus[s]}</span>
            </Link>
          ))}
        </div>

        <form className="grid grid-cols-2 gap-3 pt-1 md:grid-cols-4 lg:grid-cols-5" action="/cases">
          {status && <input type="hidden" name="status" value={status} />}
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-outline uppercase">Search</label>
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Reference or title..."
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
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-outline uppercase">Sensitivity tier</label>
            <select
              name="sensitivityLevel"
              defaultValue={sensitivityLevel ?? ""}
              className="w-full cursor-pointer rounded-full border border-outline-variant/30 bg-surface-container-low px-3.5 py-1.5 text-xs text-on-surface focus:ring-1 focus:ring-primary focus:outline-none"
            >
              <option value="">All tiers</option>
              {SENSITIVITY_LEVELS.map((tier) => (
                <option key={tier} value={tier}>Tier {tier}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button type="submit" className="w-full rounded-full bg-primary px-3 py-2 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-container">
              Apply filters
            </button>
          </div>
          <div className="flex items-end">
            <Link
              href="/cases"
              className="flex w-full items-center justify-center gap-1 rounded-full bg-surface-container px-3 py-2 text-xs font-medium text-on-surface-variant transition-colors hover:text-primary"
            >
              <span className="material-symbols-outlined text-base">filter_alt_off</span>
              Reset
            </Link>
          </div>
        </form>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-card">
        <CasesTable cases={cases} />

        <div className="flex flex-col items-center justify-between gap-3 border-t border-outline-variant/20 bg-surface-container-low/40 p-4 sm:flex-row">
          <div className="text-xs text-on-surface-variant">
            Showing <span className="font-semibold text-on-surface">{cases.length === 0 ? 0 : offset + 1}-{offset + cases.length}</span> of{" "}
            <span className="font-semibold text-on-surface">{total}</span> cases
          </div>
          <div className="flex items-center gap-2">
            <Link
              aria-disabled={offset === 0}
              href={`/cases?${new URLSearchParams({ ...(status ? { status } : {}), ...(preserved ? Object.fromEntries(activeParams) : {}), offset: String(Math.max(0, offset - PAGE_SIZE)) })}`}
              className={`rounded-full border border-outline-variant/30 p-1.5 text-outline transition-colors ${offset === 0 ? "pointer-events-none opacity-40" : "hover:bg-surface-container"}`}
            >
              <span className="material-symbols-outlined text-base">chevron_left</span>
            </Link>
            <Link
              aria-disabled={offset + PAGE_SIZE >= total}
              href={`/cases?${new URLSearchParams({ ...(status ? { status } : {}), ...(preserved ? Object.fromEntries(activeParams) : {}), offset: String(offset + PAGE_SIZE) })}`}
              className={`rounded-full border border-outline-variant/30 p-1.5 text-outline transition-colors ${offset + PAGE_SIZE >= total ? "pointer-events-none opacity-40" : "hover:bg-surface-container"}`}
            >
              <span className="material-symbols-outlined text-base">chevron_right</span>
            </Link>
          </div>
        </div>
      </div>

      {stats.pendingApprovals > 0 && (
        <div className="flex flex-col items-center justify-between gap-6 rounded-2xl border border-outline-variant/40 bg-linear-to-r from-secondary-fixed/40 via-surface-container-low to-surface-container-lowest p-6 shadow-card md:flex-row">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-container text-secondary-fixed shadow-card">
              <span className="material-symbols-outlined text-2xl">policy</span>
            </div>
            <div>
              <h3 className="text-base font-bold text-primary">Approval requests awaiting a decision</h3>
              <p className="mt-0.5 max-w-2xl text-sm text-on-surface-variant">
                {stats.pendingApprovals} request{stats.pendingApprovals === 1 ? "" : "s"} across your accessible cases need a Team Lead,
                Fraud/Risk Manager, or MLRO decision — segregation of duties means the requester cannot self-approve. Open each
                case&apos;s Approvals tab to decide.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
