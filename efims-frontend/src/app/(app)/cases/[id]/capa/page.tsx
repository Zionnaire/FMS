import { Search, ClipboardCheck } from "lucide-react";
import { requireSession } from "@/features/auth/session";
import { listRootCauses, listCapaActions } from "@/features/capa/api";
import { startCapaActionAction } from "@/features/capa/actions";
import { listUsers, userDisplayNameMap } from "@/features/users/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/shell/submit-button";
import { StatusBadge } from "@/components/shell/status-badge";
import { RootCauseForm, NewCapaActionForm, CompleteCapaForm, CancelCapaForm, ValidateCapaForm } from "./capa-forms";

export default async function CaseCapaPage(props: PageProps<"/cases/[id]/capa">) {
  const { id } = await props.params;
  const { accessToken } = await requireSession();
  const [rootCauses, actions, users] = await Promise.all([listRootCauses(accessToken, id), listCapaActions(accessToken, id), listUsers(accessToken)]);
  const nameOf = userDisplayNameMap(users);
  const latestRootCause = rootCauses[0];

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Card className="rounded-xl border-outline-variant/60 shadow-card">
        <CardHeader><CardTitle className="flex items-center gap-2 text-sm font-bold text-on-surface"><Search size={16} className="text-tertiary" />Root cause {latestRootCause && `(v${latestRootCause.version})`}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {latestRootCause ? (
            <div className="rounded-xl bg-surface-container-low p-3 text-xs">
              <p>{latestRootCause.summary}</p>
              {latestRootCause.analysisMethod && <p className="mt-1 text-on-surface-variant">Method: {latestRootCause.analysisMethod}</p>}
            </div>
          ) : (
            <p className="text-xs text-on-surface-variant">No root cause analysis yet.</p>
          )}
          <RootCauseForm caseId={id} />
        </CardContent>
      </Card>

      <Card className="rounded-xl border-outline-variant/60 shadow-card">
        <CardHeader><CardTitle className="flex items-center gap-2 text-sm font-bold text-on-surface"><ClipboardCheck size={16} className="text-tertiary" />New CAPA action</CardTitle></CardHeader>
        <CardContent>
          <NewCapaActionForm caseId={id} rootCauseId={latestRootCause?.id} users={users} />
        </CardContent>
      </Card>

      <div className="space-y-3 lg:col-span-2">
        {actions.length === 0 && (
          <div className="rounded-xl border border-dashed border-outline-variant/50 bg-surface-container-low p-6 text-center text-xs text-on-surface-variant">
            No CAPA actions yet.
          </div>
        )}
        {actions.map((action) => (
          <Card key={action.id} className="rounded-xl border-outline-variant/60 shadow-card">
            <CardContent className="space-y-2 pt-4 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-on-surface">{action.title} <span className="font-normal text-on-surface-variant">({action.type})</span></span>
                <StatusBadge status={action.status} tone={action.status === "VALIDATED" ? "positive" : action.status === "CANCELLED" ? "critical" : "warning"} />
              </div>
              <p className="text-on-surface-variant">{action.description}</p>
              <p className="text-on-surface-variant">Owner: {nameOf.get(action.ownerId) ?? action.ownerId} — Due {new Date(action.dueDate).toLocaleDateString()}</p>
              <div className="flex flex-wrap gap-2 border-t border-outline-variant pt-2">
                {action.status === "OPEN" && (
                  <form action={startCapaActionAction.bind(null, id, action.id)}><SubmitButton size="sm" variant="outline">Start</SubmitButton></form>
                )}
                {(action.status === "OPEN" || action.status === "IN_PROGRESS") && (
                  <CompleteCapaForm caseId={id} actionId={action.id} />
                )}
                {action.status === "COMPLETED" && (
                  <ValidateCapaForm caseId={id} actionId={action.id} />
                )}
                {action.status !== "VALIDATED" && action.status !== "CANCELLED" && (
                  <CancelCapaForm caseId={id} actionId={action.id} />
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
