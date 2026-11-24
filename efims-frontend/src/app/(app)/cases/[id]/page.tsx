import { SlidersHorizontal, Flag, History } from "lucide-react";
import { requireSession } from "@/features/auth/session";
import { getCaseCached } from "@/features/cases/get-case-cached";
import { listCaseFlags, listCaseStatusHistory } from "@/features/cases/api";
import { updateCaseStatusAction, assignCaseTeamAction, addCaseFlagAction, removeCaseFlagAction } from "@/features/cases/actions";
import { CASE_STATUSES, CASE_USER_RELATION_TYPES } from "@/features/cases/types";
import { listTeams } from "@/features/teams/api";
import { listUsers, userDisplayNameMap } from "@/features/users/api";
import { listApprovals } from "@/features/workflow/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SubmitButton } from "@/components/shell/submit-button";
import { StatusBadge } from "@/components/shell/status-badge";
import { TeamAssignmentForm } from "./team-assignment-form";

export default async function CaseOverviewPage(props: PageProps<"/cases/[id]">) {
  const { id } = await props.params;
  const { accessToken } = await requireSession();
  const caseRecord = await getCaseCached(accessToken, id);

  const [flags, history, teams, users, approvals] = await Promise.all([
    listCaseFlags(accessToken, id),
    listCaseStatusHistory(accessToken, id),
    listTeams(accessToken),
    listUsers(accessToken),
    listApprovals(accessToken, id),
  ]);
  const nameOf = userDisplayNameMap(users);
  const approvedClosure = approvals.find((a) => a.action === "CASE_CLOSURE" && a.status === "APPROVED");

  const updateStatus = updateCaseStatusAction.bind(null, id);
  const assignTeam = assignCaseTeamAction.bind(null, id);
  const addFlag = addCaseFlagAction.bind(null, id);

  return (
    <div className="grid grid-cols-1 gap-5">
      <Card className="rounded-xl border-outline-variant/60 shadow-card">
        <CardHeader><CardTitle className="flex items-center gap-2 text-sm font-bold text-on-surface"><SlidersHorizontal size={16} className="text-tertiary" />Status &amp; team</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <form action={updateStatus} className="space-y-2">
            <Label className="text-xs font-bold uppercase">Change status</Label>
            <Select name="status" required>
              <SelectTrigger className="w-full"><SelectValue placeholder="New status" /></SelectTrigger>
              <SelectContent>
                {CASE_STATUSES.filter((s) => s !== caseRecord.status).map((s) => (
                  <SelectItem key={s} value={s}>{s.replaceAll("_", " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input name="reason" placeholder="Reason (optional, min 5 chars)" />
            {approvedClosure && (
              <input type="hidden" name="approvalId" value={approvedClosure.id} />
            )}
            <p className="text-[11px] text-on-surface-variant">
              {approvedClosure
                ? "An approved CASE_CLOSURE request exists — closing will reference it automatically."
                : "Closing requires an approved CASE_CLOSURE request first (see Approvals tab)."}
            </p>
            <SubmitButton size="sm">Update status</SubmitButton>
          </form>

          <TeamAssignmentForm caseId={id} assignedTeamId={caseRecord.assignedTeamId} teams={teams} action={assignTeam} />
        </CardContent>
      </Card>

      <Card className="rounded-xl border-outline-variant/60 shadow-card">
        <CardHeader><CardTitle className="flex items-center gap-2 text-sm font-bold text-on-surface"><Flag size={16} className="text-error" />Subject &amp; conflict flags</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {flags.length === 0 && <p className="text-xs text-on-surface-variant">No flags declared on this case.</p>}
          <ul className="space-y-2">
            {flags.map((flag) => (
              <li key={flag.id} className="flex items-center justify-between rounded-xl bg-surface-container-low p-2.5 text-xs">
                <span>
                  <StatusBadge status={flag.type} tone={flag.type === "SUBJECT" ? "critical" : "warning"} />{" "}
                  {nameOf.get(flag.userId) ?? flag.userId} {flag.reason && `— ${flag.reason}`}
                </span>
                <form action={removeCaseFlagAction.bind(null, id, flag.id)}>
                  <SubmitButton size="sm" variant="ghost" pendingText="…">Clear</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
          <form action={addFlag} className="space-y-2 border-t border-outline-variant pt-3">
            <Select name="userId" required>
              <SelectTrigger className="w-full"><SelectValue placeholder="User" /></SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.fullName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select name="type" required>
              <SelectTrigger className="w-full"><SelectValue placeholder="Flag type" /></SelectTrigger>
              <SelectContent>
                {CASE_USER_RELATION_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input name="reason" placeholder="Reason (optional)" />
            <SubmitButton size="sm" variant="outline">Add flag</SubmitButton>
          </form>
        </CardContent>
      </Card>

      <Card className="rounded-xl border-outline-variant/60 shadow-card lg:col-span-2">
        <CardHeader><CardTitle className="flex items-center gap-2 text-sm font-bold text-on-surface"><History size={16} className="text-tertiary" />Status history</CardTitle></CardHeader>
        <CardContent>
          {history.length === 0 && <p className="text-xs text-on-surface-variant">No transitions recorded.</p>}
          <ul className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
            {history.map((h) => (
              <li key={h.id} className="rounded-xl bg-surface-container-low p-2.5">
                <span className="font-medium text-on-surface">{h.fromStatus ?? "—"} → {h.toStatus}</span>
                <span className="ml-2 text-on-surface-variant">{new Date(h.changedAt).toLocaleString()}</span>
                {h.reason && <p className="mt-0.5 text-on-surface-variant">{h.reason}</p>}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
