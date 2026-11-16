import Link from "next/link";
import { Plus, FilterX, ChevronLeft, ChevronRight, ShieldCheck } from "lucide-react";
import { requireSession } from "@/features/auth/session";
import { listCases, getCaseStats } from "@/features/cases/api";
import { CASE_STATUSES, SEVERITY_TIERS, type CaseStatus, type SeverityTier } from "@/features/cases/types";
import { COMPARTMENTS, type Compartment } from "@/features/auth/types";
import { listTeams } from "@/features/teams/api";
import { getTasksRegister } from "@/features/tasks/api";
import { getCapaRegister } from "@/features/capa/api";
import { getApprovalsRegister } from "@/features/workflow/api";
import { getContainmentRegister } from "@/features/containment/api";
import { mergeTaskRows } from "@/features/tasks/merge";
import { isPastDeadline } from "@/lib/time";
import { CasesTable } from "./cases-table";
import { TasksTable } from "./tasks-table";

const PAGE_SIZE = 20;
const SENSITIVITY_LEVELS = [1, 2, 3, 4] as const;

const SEVERITY_LABEL: Record<SeverityTier, string> = { S1: "S1 CRITICAL", S2: "S2 HIGH", S3: "S3 MEDIUM", S4: "S4 LOW" };
const SEVERITY_DOT: Record<SeverityTier, string> = {
  S1: "var(--color-severity-s1)",
  S2: "var(--color-severity-s2)",
  S3: "var(--color-severity-s3)",
  S4: "var(--color-severity-s4)",
};

const SEV_FILTERS = [
  { key: "", label: "All" },
  { key: "s1-s2", label: "S1–S2" },
  { key: "overdue", label: "Overdue" },
] as const;

function isSevFilter(value: string | undefined): value is "s1-s2" | "overdue" {
  return value === "s1-s2" || value === "overdue";
}

const CASE_TASK_TABS = [
  { key: "cases", label: "Cases" },
  { key: "tasks", label: "Tasks" },
] as const;

const TASK_FILTERS = [
  { key: "all", label: "All" },
  { key: "mine", label: "Mine" },
  { key: "overdue", label: "Overdue" },
] as const;
type TaskFilter = (typeof TASK_FILTERS)[number]["key"];

function isTaskFilter(value: string | undefined): value is TaskFilter {
  return value === "all" || value === "mine" || value === "overdue";
}

/** `/cases`'s Tasks tab — Contra/SimpliRisk-inspired cross-case task view, merging real
 * freestanding `Task` rows with derived rows from CAPA/approvals/containment (see
 * `mergeTaskRows`'s own doc comment for why those three are read-only here). */
async function TasksTabContent({ accessToken, currentUserId, filter }: { accessToken: string; currentUserId: string; filter: TaskFilter }) {
  const [tasks, capaActions, approvals, containmentRequests] = await Promise.all([
    getTasksRegister(accessToken),
    getCapaRegister(accessToken),
    getApprovalsRegister(accessToken),
    getContainmentRegister(accessToken),
  ]);

  const openTasks = tasks.filter((t) => t.status === "OPEN");
  const openCapa = capaActions.filter((c) => c.status === "OPEN" || c.status === "IN_PROGRESS");
  const pendingApprovals = approvals.filter((a) => a.status === "PENDING");
  const requestedContainment = containmentRequests.filter((c) => c.status === "REQUESTED");

  let rows = mergeTaskRows(openTasks, openCapa, pendingApprovals, requestedContainment);
  if (filter === "mine") rows = rows.filter((r) => r.assignee === currentUserId);
  if (filter === "overdue") rows = rows.filter((r) => r.dueAt && isPastDeadline(r.dueAt));

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-outline-variant/40 pb-3">
        {TASK_FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/cases?tab=tasks${f.key === "all" ? "" : `&taskFilter=${f.key}`}`}
            className={`rounded-full px-4 py-2 text-xs font-semibold transition-all ${filter === f.key ? "bg-primary text-on-primary" : "bg-surface-container text-on-surface-variant hover:text-on-surface"}`}
          >
            {f.label}
          </Link>
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-card">
        <div className="border-b border-outline-variant/20 bg-surface-container-low/40 px-5 py-3 text-xs text-on-surface-variant">
          {rows.length} item{rows.length === 1 ? "" : "s"} across every case you can access — a real freestanding to-do, an open
          remediation action, a pending approval, or a requested containment action.
        </div>
        <TasksTable rows={rows} />
      </div>
    </>
  );
}

function isCaseStatus(value: string | undefined): value is CaseStatus {
  return !!value && (CASE_STATUSES as readonly string[]).includes(value);
}

function isCompartment(value: string | undefined): value is Compartment {
  return !!value && (COMPARTMENTS as readonly string[]).includes(value);
}

function CaseTaskTabBar({ tab }: { tab: "cases" | "tasks" }) {
  return (
    <div className="flex gap-2 border-b border-outline-variant/40 pb-0">
      {CASE_TASK_TABS.map((t) => (
        <Link
          key={t.key}
          href={`/cases${t.key === "cases" ? "" : "?tab=tasks"}`}
          className={`-mb-px rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
            tab === t.key ? "border-tertiary text-tertiary" : "border-transparent text-on-surface-variant hover:text-on-surface"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

export default async function CasesPage(props: PageProps<"/cases">) {
  const searchParams = await props.searchParams;
  const tab = (searchParams.tab as string | undefined) === "tasks" ? "tasks" : "cases";

  if (tab === "tasks") {
    const taskFilter = isTaskFilter(searchParams.taskFilter as string | undefined) ? (searchParams.taskFilter as TaskFilter) : "all";
    const { accessToken, user } = await requireSession();
    return (
      <>
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Cases</h1>
          <p className="mt-1 text-xs text-on-surface-variant">
            Cases and Tasks are two views of the same work — this tab is everything due across your accessible cases.
          </p>
        </div>
        <CaseTaskTabBar tab="tasks" />
        <TasksTabContent accessToken={accessToken} currentUserId={user.sub} filter={taskFilter} />
      </>
    );
  }

  const status = isCaseStatus(searchParams.status as string | undefined) ? (searchParams.status as CaseStatus) : undefined;
  const compartment = isCompartment(searchParams.compartment as string | undefined) ? (searchParams.compartment as Compartment) : undefined;
  const sensitivityLevel = Number(searchParams.sensitivityLevel) || undefined;
  const q = (searchParams.q as string | undefined) || undefined;
  const offset = Number(searchParams.offset) || 0;
  const sevFilter = isSevFilter(searchParams.sevFilter as string | undefined) ? (searchParams.sevFilter as "s1-s2" | "overdue") : undefined;

  const { accessToken } = await requireSession();
  const [{ cases, total }, stats, teams] = await Promise.all([
    listCases({ accessToken, status, compartment, sensitivityLevel, q, limit: PAGE_SIZE, offset, sevFilter }),
    getCaseStats(accessToken),
    listTeams(accessToken),
  ]);

  // Every field below (status/compartment/sensitivityLevel/q) except `sevFilter` — that one gets
  // its own segmented control further down and is preserved separately alongside this set.
  const activeParams = new URLSearchParams();
  if (status) activeParams.set("status", status);
  if (compartment) activeParams.set("compartment", compartment);
  if (sensitivityLevel) activeParams.set("sensitivityLevel", String(sensitivityLevel));
  if (q) activeParams.set("q", q);
  const sevFilterHref = (key: string) => {
    const params = new URLSearchParams(activeParams);
    if (key) params.set("sevFilter", key);
    const qs = params.toString();
    return `/cases${qs ? `?${qs}` : ""}`;
  };

  return (
    <>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-on-surface">Cases</h1>
            {/* Honest, not decorative: every tenant in this build is seed/demo data today. A real
             * "is this tenant on real production data" signal should replace this hardcoded badge
             * before any real bank deployment — not left as a permanent, unexamined claim. */}
            <span className="rounded-full border border-outline-variant/40 bg-surface-container px-2.5 py-0.5 text-[10px] font-bold tracking-wide text-on-surface-variant uppercase">
              Sample data
            </span>
          </div>
          <p className="mt-1 text-xs text-on-surface-variant">
            {stats.total} accessible under the 7-condition case-access rule — tenant, role, team, subject/conflict, clearance, compartment.
          </p>
        </div>
        <Link href="/cases/new" className="flex items-center gap-2 rounded-lg bg-tertiary px-5 py-2.5 text-xs font-semibold text-on-tertiary shadow-card transition-colors hover:bg-tertiary/90">
          <Plus size={16} strokeWidth={2.5} />
          New case
        </Link>
      </div>

      <CaseTaskTabBar tab="cases" />

      {/* KPI strip — 4 visually uniform severity-tier cards, no gradient "hero" treatment on any
       * one of them. Counts are `stats.bySeverity`, a genuinely different data dimension from
       * `byStatus` (severity is rolled up from linked incidents, not case-owned — see
       * `CaseListItem.effectiveSeverity`'s own doc comment on the backend). */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {SEVERITY_TIERS.map((tier) => (
          <div key={tier} className="flex flex-col justify-between rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-card">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-outline uppercase">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: SEVERITY_DOT[tier] }} />
                {SEVERITY_LABEL[tier]}
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-on-surface">{stats.bySeverity[tier]}</span>
            </div>
            <p className="mt-1 text-xs text-on-surface-variant">
              {tier === "S1" && stats.overdueCount > 0 ? `${stats.overdueCount} overdue across all tiers` : tier === "S1" ? "No overdue cases" : " "}
            </p>
          </div>
        ))}
      </div>

      {/* Filter controls */}
      <div className="space-y-4 rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-card">
        <div className="flex flex-wrap items-center gap-1 rounded-full border border-outline-variant/30 bg-surface-container-low p-1 w-fit">
          {SEV_FILTERS.map((f) => (
            <Link
              key={f.key}
              href={sevFilterHref(f.key)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${(sevFilter ?? "") === f.key ? "bg-tertiary text-on-tertiary" : "text-on-surface-variant hover:text-on-surface"}`}
            >
              {f.label}
            </Link>
          ))}
        </div>

        <form className="grid grid-cols-2 gap-3 pt-1 md:grid-cols-4 lg:grid-cols-5" action="/cases">
          {sevFilter && <input type="hidden" name="sevFilter" value={sevFilter} />}
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-outline uppercase">Status</label>
            <select
              name="status"
              defaultValue={status ?? ""}
              className="w-full cursor-pointer rounded-full border border-outline-variant/30 bg-surface-container-low px-3.5 py-1.5 text-xs text-on-surface focus:ring-1 focus:ring-tertiary focus:outline-none"
            >
              <option value="">All statuses</option>
              {CASE_STATUSES.map((s) => (
                <option key={s} value={s}>{s.replaceAll("_", " ")} ({stats.byStatus[s]})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-outline uppercase">Search</label>
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Reference or title..."
              className="w-full rounded-full border border-outline-variant/30 bg-surface-container-low px-3.5 py-1.5 text-xs text-on-surface placeholder:text-outline/70 focus:ring-1 focus:ring-tertiary focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-outline uppercase">Compartment</label>
            <select
              name="compartment"
              defaultValue={compartment ?? ""}
              className="w-full cursor-pointer rounded-full border border-outline-variant/30 bg-surface-container-low px-3.5 py-1.5 text-xs text-on-surface focus:ring-1 focus:ring-tertiary focus:outline-none"
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
              className="w-full cursor-pointer rounded-full border border-outline-variant/30 bg-surface-container-low px-3.5 py-1.5 text-xs text-on-surface focus:ring-1 focus:ring-tertiary focus:outline-none"
            >
              <option value="">All tiers</option>
              {SENSITIVITY_LEVELS.map((tier) => (
                <option key={tier} value={tier}>Tier {tier}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button type="submit" className="w-full rounded-full bg-tertiary px-3 py-2 text-xs font-semibold text-on-tertiary transition-colors hover:bg-tertiary/90">
              Apply filters
            </button>
          </div>
          <div className="flex items-end">
            <Link
              href="/cases"
              className="flex w-full items-center justify-center gap-1 rounded-full bg-surface-container px-3 py-2 text-xs font-medium text-on-surface-variant transition-colors hover:text-tertiary"
            >
              <FilterX size={16} />
              Reset
            </Link>
          </div>
        </form>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-card">
        <CasesTable cases={cases} teams={teams} />

        <div className="flex flex-col items-center justify-between gap-3 border-t border-outline-variant/20 bg-surface-container-low/40 p-4 sm:flex-row">
          <div className="text-xs text-on-surface-variant">
            Showing <span className="font-semibold text-on-surface">{cases.length === 0 ? 0 : offset + 1}-{offset + cases.length}</span> of{" "}
            <span className="font-semibold text-on-surface">{total}</span> cases
          </div>
          <div className="flex items-center gap-2">
            <Link
              aria-disabled={offset === 0}
              href={`/cases?${new URLSearchParams({ ...Object.fromEntries(activeParams), ...(sevFilter ? { sevFilter } : {}), offset: String(Math.max(0, offset - PAGE_SIZE)) })}`}
              className={`rounded-full border border-outline-variant/30 p-1.5 text-outline transition-colors ${offset === 0 ? "pointer-events-none opacity-40" : "hover:bg-surface-container"}`}
            >
              <ChevronLeft size={16} />
            </Link>
            <Link
              aria-disabled={offset + PAGE_SIZE >= total}
              href={`/cases?${new URLSearchParams({ ...Object.fromEntries(activeParams), ...(sevFilter ? { sevFilter } : {}), offset: String(offset + PAGE_SIZE) })}`}
              className={`rounded-full border border-outline-variant/30 p-1.5 text-outline transition-colors ${offset + PAGE_SIZE >= total ? "pointer-events-none opacity-40" : "hover:bg-surface-container"}`}
            >
              <ChevronRight size={16} />
            </Link>
          </div>
        </div>
      </div>

      {stats.pendingApprovals > 0 && (
        <div className="flex flex-col items-center justify-between gap-6 rounded-xl border border-outline-variant/60 bg-tertiary-container/40 p-6 shadow-card md:flex-row">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-tertiary-container text-tertiary shadow-card">
              <ShieldCheck size={24} strokeWidth={2} />
            </div>
            <div>
              <h3 className="text-base font-bold text-on-surface">Approval requests awaiting a decision</h3>
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
