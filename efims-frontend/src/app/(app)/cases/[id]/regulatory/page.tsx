import Link from "next/link";
import { FileText, Scale } from "lucide-react";
import { requireSession } from "@/features/auth/session";
import { getCase } from "@/features/cases/api";
import { listObligations } from "@/features/regulatory/api";
import { listApprovals } from "@/features/workflow/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shell/status-badge";
import { Button } from "@/components/ui/button";
import { NewObligationForm, SubmitObligationForm, WaiveObligationForm, AcknowledgeObligationForm } from "./regulatory-forms";
import { FilingDetailsForm } from "./filing-details-form";

export default async function CaseRegulatoryPage(props: PageProps<"/cases/[id]/regulatory">) {
  const { id } = await props.params;
  const { accessToken } = await requireSession();
  const [obligations, approvals, caseRecord] = await Promise.all([listObligations(accessToken, id), listApprovals(accessToken, id), getCase(accessToken, id)]);

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <Card className="rounded-xl border-outline-variant/60 shadow-card lg:col-span-1">
        <CardHeader><CardTitle className="flex items-center gap-2 text-sm font-bold text-on-surface"><Scale size={16} className="text-tertiary" />New obligation</CardTitle></CardHeader>
        <CardContent><NewObligationForm caseId={id} /></CardContent>
      </Card>

      <div className="space-y-3 lg:col-span-2">
        {obligations.length === 0 && (
          <div className="rounded-xl border border-dashed border-outline-variant/50 bg-surface-container-low p-6 text-center text-xs text-on-surface-variant">
            No regulatory obligations yet.
          </div>
        )}
        {obligations.map((ob) => {
          const usedApprovalIds = new Set(ob.submissions?.map((s) => s.approvalId) ?? []);
          const availableApprovals = approvals.filter((a) => a.action === "REGULATORY_SUBMISSION" && a.status === "APPROVED" && !usedApprovalIds.has(a.id));
          return (
            <Card key={ob.id} className="rounded-xl border-outline-variant/60 shadow-card">
              <CardContent className="space-y-2 pt-4 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-on-surface">{ob.obligationType.replaceAll("_", " ")} {ob.regulatorName && `— ${ob.regulatorName}`}</span>
                  <StatusBadge status={ob.status} tone={ob.status === "ACKNOWLEDGED" ? "positive" : ob.status === "WAIVED" ? "neutral" : "warning"} />
                </div>
                <p className="text-on-surface-variant">{ob.description}</p>
                <p className="text-on-surface-variant">Deadline: {new Date(ob.deadline).toLocaleString()}</p>

                {ob.status === "PENDING" && ob.obligationType !== "OTHER" && (
                  <FilingDetailsForm
                    caseId={id}
                    obligationId={ob.id}
                    obligationType={ob.obligationType}
                    initialFilingDetails={ob.filingDetails}
                    caseDescriptionSeed={caseRecord.description}
                  />
                )}
                {ob.filingDetails && (
                  <Link href={`/regulatory-preview/${id}/${ob.id}`} target="_blank">
                    <Button type="button" variant="outline" size="sm" className="gap-1.5">
                      <FileText size={14} strokeWidth={2} />
                      Preview filing
                    </Button>
                  </Link>
                )}

                {ob.status === "PENDING" && (
                  <div className="flex flex-wrap gap-2 border-t border-outline-variant pt-2">
                    {availableApprovals.length > 0 ? (
                      <SubmitObligationForm caseId={id} obligationId={ob.id} availableApprovals={availableApprovals} />
                    ) : (
                      <p className="text-on-surface-variant">Request a REGULATORY_SUBMISSION approval on the Approvals tab to submit.</p>
                    )}
                    <WaiveObligationForm caseId={id} obligationId={ob.id} />
                  </div>
                )}
                {ob.status === "SUBMITTED" && (
                  <AcknowledgeObligationForm caseId={id} obligationId={ob.id} />
                )}
                {ob.status === "ACKNOWLEDGED" && ob.acknowledgedRef && <p className="text-on-surface-variant">Ack ref: {ob.acknowledgedRef}</p>}
                {ob.status === "WAIVED" && ob.waivedReason && <p className="text-on-surface-variant">Waived: {ob.waivedReason}</p>}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
