import { requireSession } from "@/features/auth/session";
import { listApprovals } from "@/features/workflow/api";
import { listUsers, userDisplayNameMap } from "@/features/users/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shell/status-badge";
import { RequestApprovalForm, DecideApprovalForm } from "./approvals-forms";

export default async function CaseApprovalsPage(props: PageProps<"/cases/[id]/approvals">) {
  const { id } = await props.params;
  const { accessToken } = await requireSession();
  const [approvals, users] = await Promise.all([listApprovals(accessToken, id), listUsers(accessToken)]);
  const nameOf = userDisplayNameMap(users);

  const pendingCount = approvals.filter((a) => a.status === "PENDING").length;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-4 shadow-card">
        <span className="rounded-xl bg-error-container p-2 text-on-error-container"><span className="material-symbols-outlined text-base">hourglass_top</span></span>
        <div>
          <p className="text-sm font-bold text-on-surface">{pendingCount} pending decision{pendingCount === 1 ? "" : "s"}</p>
          <p className="text-xs text-on-surface-variant">CD-04 approval matrix — no autonomous adverse action fires without a human decision.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="rounded-2xl border-outline-variant shadow-card lg:col-span-1">
          <CardHeader><CardTitle className="flex items-center gap-2 text-sm font-bold text-on-surface"><span className="material-symbols-outlined text-base text-primary">gavel</span>Request approval</CardTitle></CardHeader>
          <CardContent><RequestApprovalForm caseId={id} /></CardContent>
        </Card>

        <div className="space-y-3 lg:col-span-2">
          {approvals.length === 0 && (
            <div className="rounded-2xl border border-dashed border-outline-variant/50 bg-surface-container-low p-6 text-center text-xs text-on-surface-variant">
              No approval requests yet.
            </div>
          )}
          {approvals.map((approval) => (
            <Card key={approval.id} className={`rounded-2xl border-l-4 shadow-card ${approval.status === "APPROVED" ? "border-l-tertiary border-outline-variant" : approval.status === "REJECTED" ? "border-l-error border-outline-variant" : "border-l-secondary border-outline-variant"}`}>
              <CardContent className="space-y-2 pt-4 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-on-surface">{approval.action.replaceAll("_", " ")} — {approval.severityBand.replace("_", "/")}</span>
                  <StatusBadge status={approval.status} tone={approval.status === "APPROVED" ? "positive" : approval.status === "REJECTED" ? "critical" : "warning"} />
                </div>
                <p className="text-on-surface-variant">{approval.requestNotes}</p>
                <p className="text-on-surface-variant">Requested by {nameOf.get(approval.requestedBy) ?? approval.requestedBy}</p>
                {approval.decisionNotes && <p className="text-on-surface-variant">Decision: {approval.decisionNotes}</p>}
                {approval.status === "PENDING" && (
                  <div className="border-t border-outline-variant pt-2">
                    <DecideApprovalForm caseId={id} approvalId={approval.id} />
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
