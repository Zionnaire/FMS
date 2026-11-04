import { requireSession } from "@/features/auth/session";
import { listLosses, listRecoveries, listWriteOffs, getRecoverySummary } from "@/features/recovery/api";
import { listApprovals } from "@/features/workflow/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LossForm, RecoveryForm, WriteOffForm } from "./recovery-forms";

function formatNgn(amount: string): string {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(Number(amount));
}

export default async function CaseRecoveryPage(props: PageProps<"/cases/[id]/recovery">) {
  const { id } = await props.params;
  const { accessToken } = await requireSession();
  const [summary, losses, recoveries, writeOffs, approvals] = await Promise.all([
    getRecoverySummary(accessToken, id),
    listLosses(accessToken, id),
    listRecoveries(accessToken, id),
    listWriteOffs(accessToken, id),
    listApprovals(accessToken, id),
  ]);
  const usedApprovalIds = new Set(writeOffs.map((w) => w.approvalId));
  const availableApprovals = approvals.filter((a) => a.action === "LOSS_WRITE_OFF" && a.status === "APPROVED" && !usedApprovalIds.has(a.id));

  return (
    <>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-4">
        <Card className="rounded-2xl border-outline-variant shadow-card"><CardHeader><CardTitle className="flex items-center gap-1.5 text-[11px] uppercase text-on-surface-variant"><span className="material-symbols-outlined text-sm">trending_down</span>Total loss</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{formatNgn(summary.totalLoss)}</p></CardContent></Card>
        <Card className="rounded-2xl border-outline-variant shadow-card"><CardHeader><CardTitle className="flex items-center gap-1.5 text-[11px] uppercase text-on-surface-variant"><span className="material-symbols-outlined text-sm text-tertiary">savings</span>Recovered</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-tertiary">{formatNgn(summary.totalRecovered)}</p></CardContent></Card>
        <Card className="rounded-2xl border-outline-variant shadow-card"><CardHeader><CardTitle className="flex items-center gap-1.5 text-[11px] uppercase text-on-surface-variant"><span className="material-symbols-outlined text-sm">remove_circle</span>Written off</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{formatNgn(summary.totalWrittenOff)}</p></CardContent></Card>
        <Card className="rounded-2xl border-outline-variant bg-primary-container text-on-primary shadow-card"><CardHeader><CardTitle className="flex items-center gap-1.5 text-[11px] uppercase text-on-primary-container"><span className="material-symbols-outlined text-sm text-secondary-fixed">account_balance</span>Outstanding</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-surface-bright">{formatNgn(summary.outstanding)}</p></CardContent></Card>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="rounded-2xl border-outline-variant shadow-card">
          <CardHeader><CardTitle className="flex items-center gap-2 text-sm font-bold text-on-surface"><span className="material-symbols-outlined text-base text-error">trending_down</span>Record loss</CardTitle></CardHeader>
          <CardContent><LossForm caseId={id} /></CardContent>
        </Card>

        <Card className="rounded-2xl border-outline-variant shadow-card">
          <CardHeader><CardTitle className="flex items-center gap-2 text-sm font-bold text-on-surface"><span className="material-symbols-outlined text-base text-tertiary">savings</span>Record recovery</CardTitle></CardHeader>
          <CardContent><RecoveryForm caseId={id} /></CardContent>
        </Card>

        <Card className="rounded-2xl border-outline-variant shadow-card">
          <CardHeader><CardTitle className="flex items-center gap-2 text-sm font-bold text-on-surface"><span className="material-symbols-outlined text-base text-primary">remove_circle</span>Record write-off</CardTitle></CardHeader>
          <CardContent>
            {availableApprovals.length === 0 ? (
              <div className="rounded-xl border border-dashed border-outline-variant/50 bg-surface-container-low p-4 text-xs text-on-surface-variant">
                No unused APPROVED LOSS_WRITE_OFF request — request one on the Approvals tab first.
              </div>
            ) : (
              <WriteOffForm caseId={id} availableApprovals={availableApprovals} />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-5 shadow-card lg:grid-cols-3 text-xs">
        <div><p className="mb-2 font-bold text-on-surface-variant uppercase">Losses</p><ul className="space-y-1.5">{losses.map((l) => (<li key={l.id} className="rounded-xl bg-surface-container-low p-2.5">{formatNgn(String(l.amount))} — {l.category}</li>))}</ul></div>
        <div><p className="mb-2 font-bold text-on-surface-variant uppercase">Recoveries</p><ul className="space-y-1.5">{recoveries.map((r) => (<li key={r.id} className="rounded-xl bg-surface-container-low p-2.5">{formatNgn(String(r.amount))} — {r.method.replaceAll("_", " ")}</li>))}</ul></div>
        <div><p className="mb-2 font-bold text-on-surface-variant uppercase">Write-offs</p><ul className="space-y-1.5">{writeOffs.map((w) => (<li key={w.id} className="rounded-xl bg-surface-container-low p-2.5">{formatNgn(String(w.amount))} — {w.justification}</li>))}</ul></div>
      </div>
    </>
  );
}
