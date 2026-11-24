import { ShieldAlert } from "lucide-react";
import { requireSession } from "@/features/auth/session";
import { listContainmentRequests } from "@/features/containment/api";
import { listApprovals } from "@/features/workflow/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shell/status-badge";
import { RequestContainmentForm, ConfirmContainmentForm, RejectContainmentForm, CancelContainmentForm } from "./containment-forms";

export default async function CaseContainmentPage(props: PageProps<"/cases/[id]/containment">) {
  const { id } = await props.params;
  const { accessToken } = await requireSession();
  const [requests, approvals] = await Promise.all([listContainmentRequests(accessToken, id), listApprovals(accessToken, id)]);
  const usedApprovalIds = new Set(requests.map((r) => r.approvalId));
  const availableApprovals = approvals.filter((a) => a.action === "CONTAINMENT" && a.status === "APPROVED" && !usedApprovalIds.has(a.id));

  return (
    <div className="grid grid-cols-1 gap-5">
      <Card className="rounded-xl border-outline-variant/60 shadow-card lg:col-span-1">
        <CardHeader><CardTitle className="flex items-center gap-2 text-sm font-bold text-on-surface"><ShieldAlert size={16} className="text-tertiary" />Request containment</CardTitle></CardHeader>
        <CardContent>
          {availableApprovals.length === 0 ? (
            <div className="rounded-xl border border-dashed border-outline-variant/50 bg-surface-container-low p-4 text-xs text-on-surface-variant">
              No unused APPROVED CONTAINMENT request exists yet. Request one on the Approvals tab first.
            </div>
          ) : (
            <RequestContainmentForm caseId={id} availableApprovals={availableApprovals} />
          )}
        </CardContent>
      </Card>

      <div className="space-y-3 lg:col-span-2">
        {requests.length === 0 && (
          <div className="rounded-xl border border-dashed border-outline-variant/50 bg-surface-container-low p-6 text-center text-xs text-on-surface-variant">
            No containment requests yet.
          </div>
        )}
        {requests.map((req) => (
          <Card key={req.id} className="rounded-xl border-outline-variant/60 shadow-card">
            <CardContent className="space-y-2 pt-4 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-on-surface">{req.actionType.replaceAll("_", " ")}: {req.targetDescription}</span>
                <StatusBadge status={req.status} tone={req.status === "CONFIRMED" ? "positive" : req.status === "REJECTED" || req.status === "CANCELLED" ? "critical" : "warning"} />
              </div>
              <p className="text-on-surface-variant">{req.rationale}</p>
              {req.confirmationRef && <p className="text-on-surface-variant">Confirmation ref: {req.confirmationRef}</p>}
              {req.status === "REQUESTED" && (
                <div className="flex flex-wrap gap-2 border-t border-outline-variant pt-2">
                  <ConfirmContainmentForm caseId={id} requestId={req.id} />
                  <RejectContainmentForm caseId={id} requestId={req.id} />
                  <CancelContainmentForm caseId={id} requestId={req.id} />
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
