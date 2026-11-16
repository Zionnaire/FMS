import { ShieldCheck, AlertTriangle, Mic, ClipboardCheck } from "lucide-react";
import { requireSession } from "@/features/auth/session";
import { listInvestigationPlans, listIssues, listInterviews, listFindings } from "@/features/investigations/api";
import { listUsers, userDisplayNameMap } from "@/features/users/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shell/status-badge";
import { PlanForm, IssueForm, ResolveIssueForm, InterviewForm, FindingForm } from "./investigations-forms";

export default async function CaseInvestigationsPage(props: PageProps<"/cases/[id]/investigations">) {
  const { id } = await props.params;
  const { accessToken } = await requireSession();
  const [plans, issues, interviews, findings, users] = await Promise.all([
    listInvestigationPlans(accessToken, id),
    listIssues(accessToken, id),
    listInterviews(accessToken, id),
    listFindings(accessToken, id),
    listUsers(accessToken),
  ]);
  const nameOf = userDisplayNameMap(users);
  const latestPlan = plans[0];

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Card className="rounded-xl border-outline-variant/60 shadow-card">
        <CardHeader><CardTitle className="flex items-center gap-2 text-sm font-bold text-on-surface"><ShieldCheck size={16} className="text-tertiary" />Investigation plan {latestPlan && `(v${latestPlan.version})`}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {latestPlan ? (
            <div className="space-y-1 rounded-xl bg-surface-container-low p-3 text-xs">
              <p><span className="font-semibold">Objectives:</span> {latestPlan.objectives}</p>
              <p><span className="font-semibold">Scope:</span> {latestPlan.scope}</p>
              <StatusBadge status={latestPlan.status} tone={latestPlan.status === "COMPLETED" ? "positive" : "warning"} />
            </div>
          ) : (
            <p className="text-xs text-on-surface-variant">No investigation plan yet.</p>
          )}
          <PlanForm caseId={id} hasExistingPlan={!!latestPlan} />
        </CardContent>
      </Card>

      <Card className="rounded-xl border-outline-variant/60 shadow-card">
        <CardHeader><CardTitle className="flex items-center gap-2 text-sm font-bold text-on-surface"><AlertTriangle size={16} className="text-error" />Issues ({issues.length})</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <ul className="space-y-2">
            {issues.map((issue) => (
              <li key={issue.id} className="space-y-1 rounded-xl bg-surface-container-low p-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-on-surface">{issue.title}</span>
                  <StatusBadge status={issue.status} tone={issue.status === "RESOLVED" ? "positive" : "warning"} />
                </div>
                <p className="text-on-surface-variant">{issue.description}</p>
                {issue.status === "OPEN" && <ResolveIssueForm caseId={id} issue={issue} />}
                {issue.resolution && <p className="text-on-surface-variant">Resolved: {issue.resolution}</p>}
              </li>
            ))}
          </ul>
          <IssueForm caseId={id} />
        </CardContent>
      </Card>

      <Card className="rounded-xl border-outline-variant/60 shadow-card">
        <CardHeader><CardTitle className="flex items-center gap-2 text-sm font-bold text-on-surface"><Mic size={16} className="text-tertiary" />Interviews ({interviews.length})</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <ul className="space-y-2">
            {interviews.map((iv) => (
              <li key={iv.id} className="rounded-xl bg-surface-container-low p-2.5 text-xs">
                <p className="font-medium text-on-surface">{iv.intervieweeName} ({iv.intervieweeRole})</p>
                <p className="text-on-surface-variant">{iv.summary}</p>
                <p className="text-on-surface-variant">{new Date(iv.conductedAt).toLocaleDateString()}</p>
              </li>
            ))}
          </ul>
          <InterviewForm caseId={id} />
        </CardContent>
      </Card>

      <Card className="rounded-xl border-outline-variant/60 shadow-card">
        <CardHeader><CardTitle className="flex items-center gap-2 text-sm font-bold text-on-surface"><ClipboardCheck size={16} className="text-tertiary" />Findings ({findings.length})</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <ul className="space-y-2">
            {findings.map((f) => (
              <li key={f.id} className="rounded-xl bg-surface-container-low p-2.5 text-xs">
                <p className="font-medium text-on-surface">{f.title}</p>
                <p className="text-on-surface-variant">{f.description}</p>
                <p className="text-on-surface-variant">By {nameOf.get(f.createdBy) ?? f.createdBy}</p>
              </li>
            ))}
          </ul>
          <FindingForm caseId={id} openIssues={issues.filter((i) => i.status === "OPEN")} />
        </CardContent>
      </Card>
    </div>
  );
}
