import { requireSession } from "@/features/auth/session";
import { getCaseCached } from "@/features/cases/get-case-cached";
import { getCaseSummary } from "@/features/cases/api";
import { getRecoverySummary } from "@/features/recovery/api";
import { StatusBadge } from "@/components/shell/status-badge";
import { CaseTabs } from "./case-tabs";

const STATUS_TONE: Record<string, "positive" | "warning" | "critical" | "neutral"> = {
  OPEN: "warning",
  UNDER_INVESTIGATION: "warning",
  ON_HOLD: "neutral",
  CLOSED: "positive",
};

function formatNgn(amount: string): string {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(Number(amount));
}

export default async function CaseLayout({ children, params }: LayoutProps<"/cases/[id]">) {
  const { id } = await params;
  const { accessToken } = await requireSession();
  const caseRecord = await getCaseCached(accessToken, id);
  const [summary, recovery] = await Promise.all([getCaseSummary(accessToken, id), getRecoverySummary(accessToken, id)]);

  return (
    <>
      <div className="relative overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-6 shadow-card">
        <div className="pointer-events-none absolute -top-16 -right-16 h-64 w-64 rounded-full bg-secondary-container/20 blur-3xl" />
        <div className="relative flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-primary-container px-3 py-1 font-mono text-xs font-bold tracking-wider text-surface-bright">
                {caseRecord.referenceCode}
              </span>
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${caseRecord.sensitivityLevel === 4 ? "bg-error-container text-on-error-container" : "bg-surface-container text-on-surface-variant"}`}>
                <span className="material-symbols-outlined text-sm">shield</span>
                Tier {caseRecord.sensitivityLevel}
              </span>
              <span className="rounded-full border border-outline-variant/40 bg-surface-container px-2.5 py-1 text-xs font-medium text-on-surface-variant">
                {caseRecord.compartment}
              </span>
              <StatusBadge status={caseRecord.status} tone={STATUS_TONE[caseRecord.status] ?? "neutral"} />
            </div>
            <h1 className="font-headline text-2xl font-semibold text-primary">{caseRecord.title}</h1>
            <p className="max-w-3xl text-sm text-on-surface-variant">{caseRecord.description}</p>
          </div>
        </div>

        <div className="relative mt-6 grid grid-cols-2 gap-4 border-t border-outline-variant/20 pt-6 sm:grid-cols-4">
          <div className="rounded-xl border border-outline-variant/20 bg-surface-container-low p-4">
            <span className="flex items-center justify-between text-[11px] font-semibold text-on-surface-variant uppercase">
              Outstanding exposure
              <span className="material-symbols-outlined text-base text-outline">account_balance</span>
            </span>
            <div className="mt-2 font-headline text-lg font-bold text-primary">{formatNgn(recovery.outstanding)}</div>
            <span className="text-xs text-on-surface-variant">of {formatNgn(recovery.totalLoss)} recorded loss</span>
          </div>
          <div className="rounded-xl bg-primary-container p-4 text-on-primary shadow-card">
            <span className="flex items-center justify-between text-[11px] font-semibold text-on-primary-container uppercase">
              Recovered
              <span className="material-symbols-outlined text-base">savings</span>
            </span>
            <div className="mt-2 font-headline text-lg font-bold text-surface-bright">{formatNgn(recovery.totalRecovered)}</div>
            <span className="text-xs text-on-primary-container">{formatNgn(recovery.totalWrittenOff)} written off</span>
          </div>
          <div className="rounded-xl border border-outline-variant/20 bg-surface-container-low p-4">
            <span className="flex items-center justify-between text-[11px] font-semibold text-on-surface-variant uppercase">
              Linked incidents
              <span className="material-symbols-outlined text-base text-outline">hub</span>
            </span>
            <div className="mt-2 font-headline text-lg font-bold text-primary">{summary.linkedIncidentsCount}</div>
            <span className="text-xs text-on-surface-variant">{summary.assignedTeamName ?? "Unassigned"}</span>
          </div>
          <div className="rounded-xl border border-outline-variant/20 bg-surface-container-low p-4">
            <span className="flex items-center justify-between text-[11px] font-semibold text-on-surface-variant uppercase">
              Opened &amp; flags
              <span className="material-symbols-outlined text-base text-outline">person_alert</span>
            </span>
            <div className="mt-2 font-headline text-lg font-bold text-primary">{new Date(caseRecord.createdAt).toLocaleDateString()}</div>
            <span className="text-xs text-on-surface-variant">{summary.flagsCount} subject/conflict flag{summary.flagsCount === 1 ? "" : "s"}</span>
          </div>
        </div>
      </div>

      <CaseTabs caseId={id} />

      {children}
    </>
  );
}
