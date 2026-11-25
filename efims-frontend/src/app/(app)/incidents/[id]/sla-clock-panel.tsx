"use client";

import { useActionState } from "react";
import { startSlaClockAction, pauseSlaClockAction, resumeSlaClockAction, stopSlaClockAction } from "@/features/workflow/actions";
import type { SlaClock } from "@/features/workflow/types";
import type { FormState } from "@/lib/form-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/shell/submit-button";
import { StatusBadge } from "@/components/shell/status-badge";
import { ClientDate } from "@/components/shell/client-date";

const initialState: FormState = {};

function ErrorBanner({ state }: { state: FormState }) {
  if (!state.error) return null;
  return <p className="rounded-lg border border-error/30 bg-error-container/40 px-3 py-2 text-xs font-medium text-on-error-container">{state.error}</p>;
}

/** Extracted from `IncidentDetailPage` (a Server Component) so each SLA-clock action can use
 * `useActionState` and show its error inline instead of crashing the whole page — see
 * `startSlaClockAction`'s own doc comment for the real incident that found this. Split into two
 * components (not one with conditionally-skipped hooks) since `slaClock` being null/non-null
 * decides which action forms exist at all, and React's rules of hooks don't allow calling
 * `useActionState` conditionally within a single component. */
export function SlaClockPanel({ incidentId, slaClock, hasTriage }: { incidentId: string; slaClock: SlaClock | null; hasTriage: boolean }) {
  if (!slaClock) {
    return <StartClockForm incidentId={incidentId} hasTriage={hasTriage} />;
  }
  return <RunningClockPanel incidentId={incidentId} slaClock={slaClock} />;
}

/** `hasTriage` lets this explain the real prerequisite upfront instead of only after a failed
 * submit — found live 2026-11-24: a user filled in a target deadline and clicked "Start clock"
 * on an incident with no triage assessment yet, which the backend correctly rejects
 * ("No triage assessment exists for this incident yet"), but nothing on the form said that was
 * required before they tried. */
function StartClockForm({ incidentId, hasTriage }: { incidentId: string; hasTriage: boolean }) {
  const [state, action] = useActionState(startSlaClockAction.bind(null, incidentId), initialState);

  if (!hasTriage) {
    return (
      <p className="text-xs text-on-surface-variant">
        Complete the initial triage assessment above first. The SLA clock&apos;s calendar comes from that assessment.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-2">
      <p className="text-xs text-on-surface-variant">No SLA clock started for this incident yet.</p>
      <Label htmlFor="targetDeadline" className="text-xs">Target deadline</Label>
      <Input id="targetDeadline" name="targetDeadline" type="datetime-local" required />
      <ErrorBanner state={state} />
      <SubmitButton size="sm" pendingText="Starting…">Start clock</SubmitButton>
    </form>
  );
}

function RunningClockPanel({ incidentId, slaClock }: { incidentId: string; slaClock: SlaClock }) {
  const [pauseState, pauseAction] = useActionState(pauseSlaClockAction.bind(null, incidentId, slaClock.id), initialState);
  const [resumeState, resumeAction] = useActionState(resumeSlaClockAction.bind(null, incidentId, slaClock.id), initialState);
  const [stopState, stopAction] = useActionState(stopSlaClockAction.bind(null, incidentId, slaClock.id), initialState);

  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center justify-between">
        <StatusBadge status={slaClock.status} tone={slaClock.isBreached ? "critical" : slaClock.status === "RUNNING" ? "positive" : "neutral"} />
        <span className="font-mono text-on-surface-variant">{slaClock.calendarName}</span>
      </div>
      <p className="text-on-surface-variant">Deadline: <ClientDate value={slaClock.targetDeadline} mode="datetime" /></p>
      {slaClock.isBreached && <p className="font-semibold text-error">Breached</p>}
      {slaClock.remainingMs !== null && !slaClock.isBreached && (
        <p className="text-on-surface-variant">{Math.round(slaClock.remainingMs / 60000)} minutes remaining</p>
      )}
      <div className="flex flex-wrap gap-2 pt-1">
        {slaClock.status === "RUNNING" && (
          <form action={pauseAction} className="flex items-center gap-2">
            <Input name="reason" placeholder="Pause reason (min 10 chars)" className="h-8 text-xs" required minLength={10} />
            <SubmitButton size="sm" variant="outline" pendingText="Pausing…">Pause</SubmitButton>
          </form>
        )}
        {slaClock.status === "PAUSED" && (
          <form action={resumeAction}>
            <SubmitButton size="sm" variant="outline" pendingText="Resuming…">Resume</SubmitButton>
          </form>
        )}
        {slaClock.status !== "STOPPED" && (
          <form action={stopAction}>
            <SubmitButton size="sm" variant="outline" pendingText="Stopping…">Stop</SubmitButton>
          </form>
        )}
      </div>
      <ErrorBanner state={pauseState} />
      <ErrorBanner state={resumeState} />
      <ErrorBanner state={stopState} />
    </div>
  );
}
