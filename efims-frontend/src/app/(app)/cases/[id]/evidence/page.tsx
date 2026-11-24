import { Lock } from "lucide-react";
import { requireSession } from "@/features/auth/session";
import { listEvidence } from "@/features/evidence/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { VerifyForm } from "./verify-form";
import { IngestForm, CustodyForm, LegalHoldForm } from "./evidence-forms";

export default async function CaseEvidencePage(props: PageProps<"/cases/[id]/evidence">) {
  const { id } = await props.params;
  const { accessToken } = await requireSession();
  const items = await listEvidence(accessToken, id);

  return (
    <div className="grid grid-cols-1 gap-5">
      <Card className="rounded-xl border-outline-variant/60 shadow-card lg:col-span-1">
        <CardHeader><CardTitle className="flex items-center gap-2 text-sm font-bold text-on-surface"><Lock size={16} className="text-tertiary" />Ingest evidence</CardTitle></CardHeader>
        <CardContent><IngestForm caseId={id} /></CardContent>
      </Card>

      <div className="space-y-3 lg:col-span-2">
        {items.length === 0 && (
          <div className="rounded-xl border border-dashed border-outline-variant/50 bg-surface-container-low p-6 text-center text-xs text-on-surface-variant">
            No evidence items yet.
          </div>
        )}
        {items.map((item) => (
          <Card key={item.id} className="rounded-xl border-outline-variant/60 shadow-card">
            <CardContent className="space-y-2 pt-4 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-on-surface">{item.title}</span>
                <div className="flex gap-1.5">
                  <Badge variant="outline">{item.category}</Badge>
                  {item.legalHold && <Badge className="bg-error-container text-on-error-container">Legal hold</Badge>}
                </div>
              </div>
              <p className="font-mono text-[10px] text-on-surface-variant">{item.contentHash}</p>
              {item.custodyEvents && item.custodyEvents.length > 0 && (
                <ul className="space-y-0.5 text-on-surface-variant">
                  {item.custodyEvents.map((ev) => (
                    <li key={ev.id}>{ev.action} — {new Date(ev.occurredAt).toLocaleString()} {ev.notes && `(${ev.notes})`}</li>
                  ))}
                </ul>
              )}
              <VerifyForm caseId={id} evidenceId={item.id} />
              <CustodyForm caseId={id} evidenceId={item.id} />
              <LegalHoldForm caseId={id} evidenceId={item.id} legalHold={item.legalHold} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
