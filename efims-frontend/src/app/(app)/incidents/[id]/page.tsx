import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/features/auth/session";
import { getIncident } from "@/features/incidents/api";
import { relateIncidentsAction, mergeIncidentAction } from "@/features/incidents/actions";
import { RiskFactorsForm } from "./risk-factors-form";
import { assessIncidentAction, escalateIncidentAction } from "@/features/triage/actions";
import { getCurrentTriage, getTriageHistory } from "@/features/triage/api";
import { SEVERITY_TIERS } from "@/features/triage/types";
import { startSlaClockAction, pauseSlaClockAction, resumeSlaClockAction, stopSlaClockAction } from "@/features/workflow/actions";
import { getCurrentSlaClock } from "@/features/workflow/api";
import { listTeams } from "@/features/teams/api";
import { listUsers, userDisplayNameMap } from "@/features/users/api";
import { ApiError } from "@/lib/backend-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SubmitButton } from "@/components/shell/submit-button";
import { StatusBadge } from "@/components/shell/status-badge";
import { SeveritySuggestionPanel } from "./severity-suggestion-panel";
import { SimilarIncidentsPanel } from "./similar-incidents-panel";

const STATUS_TONE: Record<string, "positive" | "warning" | "critical" | "neutral"> = {
  OPEN: "warning",
  UNDER_REVIEW: "warning",
  LINKED_TO_CASE: "positive",
  MERGED: "neutral",
  REJECTED: "critical",
  CLOSED_NO_CASE: "neutral",
};

export default async function IncidentDetailPage(props: PageProps<"/incidents/[id]">) {
  const { id } = await props.params;
  const { accessToken } = await requireSession();

  let incident;
  try {
    incident = await getIncident(accessToken, id);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 403)) notFound();
    throw error;
  }

  const [currentTriage, triageHistory, slaClock, teams, users] = await Promise.all([
    getCurrentTriage(accessToken, id),
    getTriageHistory(accessToken, id),
    getCurrentSlaClock(accessToken, id),
    listTeams(accessToken),
    listUsers(accessToken),
  ]);
  const nameOf = userDisplayNameMap(users);

  const assessAction = assessIncidentAction.bind(null, id);
  const escalateAction = escalateIncidentAction.bind(null, id);
  const startClockAction = startSlaClockAction.bind(null, id);
  const relateAction = relateIncidentsAction.bind(null, id);
  const mergeAction = mergeIncidentAction.bind(null, id);

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <p className="font-mono text-xs font-semibold text-primary">{incident.referenceCode}</p>
          <h1 className="font-headline text-2xl font-semibold text-on-surface">{incident.title}</h1>
        </div>
        <StatusBadge status={incident.status} tone={STATUS_TONE[incident.status] ?? "neutral"} />
      </div>

      <Card className="border-outline-variant shadow-card">
        <CardHeader>
          <CardTitle className="text-sm font-bold text-on-surface">Overview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-on-surface-variant">{incident.description}</p>
          <div className="grid grid-cols-2 gap-3 pt-2 text-xs sm:grid-cols-4">
            <div>
              <p className="text-on-surface-variant uppercase">Category</p>
              <p className="font-medium text-on-surface">{incident.category}</p>
            </div>
            <div>
              <p className="text-on-surface-variant uppercase">Type</p>
              <p className="font-medium text-on-surface">{incident.type}</p>
            </div>
            <div>
              <p className="text-on-surface-variant uppercase">Compartment</p>
              <p className="font-medium text-on-surface">{incident.compartment}</p>
            </div>
            <div>
              <p className="text-on-surface-variant uppercase">Reported</p>
              <p className="font-medium text-on-surface">{new Date(incident.occurredAt ?? incident.createdAt).toLocaleString()}</p>
            </div>
          </div>
          {incident.caseId && (
            <p className="pt-2 text-xs">
              Linked to case:{" "}
              <Link href={`/cases/${incident.caseId}`} className="font-semibold text-primary underline underline-offset-2">
                View case
              </Link>
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="border-outline-variant shadow-card">
        <CardHeader>
          <CardTitle className="text-sm font-bold text-on-surface">Risk factors</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-xs text-on-surface-variant">
            Structured facts the AI severity model uses — fill in what you know; every field is optional.
          </p>
          <RiskFactorsForm incidentId={id} incident={incident} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card className="border-outline-variant shadow-card">
          <CardHeader>
            <CardTitle className="text-sm font-bold text-on-surface">Triage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {currentTriage ? (
              <div className="space-y-1 rounded-lg bg-surface-container-low p-3 text-xs">
                <div className="flex items-center justify-between">
                  <StatusBadge status={currentTriage.severity} tone={currentTriage.severity === "S1" ? "critical" : "warning"} />
                  <span className="text-on-surface-variant">{currentTriage.slaCalendarName}</span>
                </div>
                <p className="text-on-surface">{currentTriage.rationale}</p>
                <p className="text-on-surface-variant">By {nameOf.get(currentTriage.assessedBy) ?? currentTriage.assessedBy}</p>
              </div>
            ) : (
              <p className="text-xs text-on-surface-variant">No triage assessment yet.</p>
            )}

            <SeveritySuggestionPanel incidentId={id} />

            <form action={currentTriage ? escalateAction : assessAction} className="space-y-2 border-t border-outline-variant pt-3">
              <p className="text-xs font-bold text-on-surface-variant uppercase">
                {currentTriage ? "Escalate / revise" : "Initial assessment"}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Select name="severity" required>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Severity" /></SelectTrigger>
                  <SelectContent>
                    {SEVERITY_TIERS.map((tier) => (
                      <SelectItem key={tier} value={tier}>{tier}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input name="slaCalendarName" placeholder="24x7" required />
              </div>
              <Select name="assignedTeamId">
                <SelectTrigger className="w-full"><SelectValue placeholder="Assign team (optional)" /></SelectTrigger>
                <SelectContent>
                  {teams.map((team) => (
                    <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Textarea name="rationale" placeholder="Rationale (min 10 characters)" required minLength={10} />
              <SubmitButton size="sm">{currentTriage ? "Escalate" : "Assess"}</SubmitButton>
            </form>

            {triageHistory.length > 1 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-on-surface-variant">History ({triageHistory.length})</summary>
                <ul className="mt-2 space-y-1">
                  {triageHistory.map((t) => (
                    <li key={t.id} className="rounded bg-surface-container-low p-2">
                      {t.severity} — {new Date(t.assessedAt).toLocaleString()}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </CardContent>
        </Card>

        <Card className="border-outline-variant shadow-card">
          <CardHeader>
            <CardTitle className="text-sm font-bold text-on-surface">SLA clock</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {slaClock ? (
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <StatusBadge status={slaClock.status} tone={slaClock.isBreached ? "critical" : slaClock.status === "RUNNING" ? "positive" : "neutral"} />
                  <span className="font-mono text-on-surface-variant">{slaClock.calendarName}</span>
                </div>
                <p className="text-on-surface-variant">Deadline: {new Date(slaClock.targetDeadline).toLocaleString()}</p>
                {slaClock.isBreached && <p className="font-semibold text-error">Breached</p>}
                {slaClock.remainingMs !== null && !slaClock.isBreached && (
                  <p className="text-on-surface-variant">{Math.round(slaClock.remainingMs / 60000)} minutes remaining</p>
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  {slaClock.status === "RUNNING" && (
                    <form action={async (fd: FormData) => { "use server"; await pauseSlaClockAction(id, slaClock.id, fd); }} className="flex items-center gap-2">
                      <Input name="reason" placeholder="Pause reason (min 10 chars)" className="h-8 text-xs" required minLength={10} />
                      <SubmitButton size="sm" variant="outline">Pause</SubmitButton>
                    </form>
                  )}
                  {slaClock.status === "PAUSED" && (
                    <form action={async () => { "use server"; await resumeSlaClockAction(id, slaClock.id); }}>
                      <SubmitButton size="sm" variant="outline">Resume</SubmitButton>
                    </form>
                  )}
                  {slaClock.status !== "STOPPED" && (
                    <form action={async () => { "use server"; await stopSlaClockAction(id, slaClock.id); }}>
                      <SubmitButton size="sm" variant="outline">Stop</SubmitButton>
                    </form>
                  )}
                </div>
              </div>
            ) : (
              <form action={startClockAction} className="space-y-2">
                <p className="text-xs text-on-surface-variant">No SLA clock started for this incident yet.</p>
                <Label htmlFor="targetDeadline" className="text-xs">Target deadline</Label>
                <Input id="targetDeadline" name="targetDeadline" type="datetime-local" required />
                <SubmitButton size="sm">Start clock</SubmitButton>
              </form>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-outline-variant shadow-card">
        <CardHeader>
          <CardTitle className="text-sm font-bold text-on-surface">Relate / merge</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <SimilarIncidentsPanel incidentId={id} />
          <div className="grid grid-cols-1 gap-4 border-t border-outline-variant pt-4 sm:grid-cols-2">
          <form action={relateAction} className="space-y-2">
            <Label className="text-xs">Mark as related to another incident</Label>
            <Input name="relatedIncidentId" placeholder="Incident id (UUID)" required />
            <SubmitButton size="sm" variant="outline">Relate</SubmitButton>
          </form>
          <form action={mergeAction} className="space-y-2">
            <Label className="text-xs">Merge into an existing incident (this one becomes a duplicate)</Label>
            <Input name="targetIncidentId" placeholder="Surviving incident id (UUID)" required />
            <SubmitButton size="sm" variant="outline">Merge</SubmitButton>
          </form>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
