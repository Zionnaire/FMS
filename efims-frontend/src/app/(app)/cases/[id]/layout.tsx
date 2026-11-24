import { Shield, Landmark, PiggyBank, Network, Flag } from "lucide-react";
import { requireSession } from "@/features/auth/session";
import { getCaseCached } from "@/features/cases/get-case-cached";
import { getCaseSummary } from "@/features/cases/api";
import { getRecoverySummary } from "@/features/recovery/api";
import { StatusBadge } from "@/components/shell/status-badge";
import { CaseTabs } from "./case-tabs";
import { CaseRightRail } from "./right-rail";

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
      <div className="relative overflow-hidden rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-6 shadow-card">
        <div className="relative flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-primary px-3 py-1 font-mono text-xs font-bold tracking-wider text-on-primary">
                {caseRecord.referenceCode}
              </span>
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${caseRecord.sensitivityLevel === 4 ? "bg-error-container text-on-error-container" : "bg-surface-container text-on-surface-variant"}`}>
                <Shield size={14} />
                Tier {caseRecord.sensitivityLevel}
              </span>
              <span className="rounded-full border border-outline-variant/40 bg-surface-container px-2.5 py-1 text-xs font-medium text-on-surface-variant">
                {caseRecord.compartment}
              </span>
              <StatusBadge status={caseRecord.status} tone={STATUS_TONE[caseRecord.status] ?? "neutral"} />
            </div>
            <h1 className="text-2xl font-bold text-on-surface">{caseRecord.title}</h1>
            <p className="max-w-3xl text-sm text-on-surface-variant">{caseRecord.description}</p>
          </div>
        </div>

        <div className="relative mt-6 grid grid-cols-1 grid-rows-4 gap-4 border-t border-outline-variant/20 pt-6 sm:grid-flow-col sm:grid-cols-2 sm:grid-rows-2">
          <div className="rounded-lg border border-outline-variant/40 bg-surface-container-low p-4">
            <span className="flex items-center justify-between text-[11px] font-semibold text-on-surface-variant uppercase">
              Outstanding exposure
              <Landmark size={16} className="text-outline" />
            </span>
            <div className="mt-2 text-lg font-bold text-on-surface">{formatNgn(recovery.outstanding)}</div>
            <span className="text-xs text-on-surface-variant">of {formatNgn(recovery.totalLoss)} recorded loss</span>
          </div>
          <div className="rounded-lg border border-outline-variant/40 bg-surface-container-low p-4">
            <span className="flex items-center justify-between text-[11px] font-semibold text-on-surface-variant uppercase">
              Recovered
              <PiggyBank size={16} className="text-tertiary" />
            </span>
            <div className="mt-2 text-lg font-bold text-on-surface">{formatNgn(recovery.totalRecovered)}</div>
            <span className="text-xs text-on-surface-variant">{formatNgn(recovery.totalWrittenOff)} written off</span>
          </div>
          <div className="rounded-lg border border-outline-variant/40 bg-surface-container-low p-4">
            <span className="flex items-center justify-between text-[11px] font-semibold text-on-surface-variant uppercase">
              Linked incidents
              <Network size={16} className="text-outline" />
            </span>
            <div className="mt-2 text-lg font-bold text-on-surface">{summary.linkedIncidentsCount}</div>
            <span className="text-xs text-on-surface-variant">{summary.assignedTeamName ?? "Unassigned"}</span>
          </div>
          <div className="rounded-lg border border-outline-variant/40 bg-surface-container-low p-4">
            <span className="flex items-center justify-between text-[11px] font-semibold text-on-surface-variant uppercase">
              Opened &amp; flags
              <Flag size={16} className="text-outline" />
            </span>
            <div className="mt-2 text-lg font-bold text-on-surface">{new Date(caseRecord.createdAt).toLocaleDateString()}</div>
            <span className="text-xs text-on-surface-variant">{summary.flagsCount} subject/conflict flag{summary.flagsCount === 1 ? "" : "s"}</span>
          </div>
        </div>
      </div>

      <CaseTabs caseId={id} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-6">{children}</div>
        <CaseRightRail
          caseId={id}
          referenceCode={caseRecord.referenceCode}
          title={caseRecord.title}
          assignedTeamName={summary.assignedTeamName}
          linkedIncidents={summary.linkedIncidents}
        />
      </div>
    </>
  );
}
