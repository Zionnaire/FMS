"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { TeamConflictCheckResult } from "@/features/cases/types";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SubmitButton } from "@/components/shell/submit-button";

/** Real version of what the "team assignment conflict check" mockup was reaching for — see
 * `CasesService.checkTeamConflicts`'s own doc comment for what this is (and isn't: no PEP/
 * beneficial-ownership screening, no fabricated hardware-token infrastructure, just the real
 * SUBJECT/CONFLICT flags this app already enforces at access time, surfaced here proactively).
 * Fires the check as soon as a candidate team is picked, before the analyst submits the actual
 * assignment — advisory only, never blocks the submit button. */
export function TeamAssignmentForm({
  caseId,
  assignedTeamId,
  teams,
  action,
}: {
  caseId: string;
  assignedTeamId: string | null;
  teams: { id: string; name: string }[];
  action: (formData: FormData) => void;
}) {
  const [check, setCheck] = useState<{ loading: boolean; result: TeamConflictCheckResult | null; error: string | null }>({
    loading: false,
    result: null,
    error: null,
  });
  // Pre-existing bug, found while building this: `<Select>` here was always uncontrolled, so
  // after picking a *different* team the trigger fell back to showing the raw team id instead
  // of its name — `SelectValue`'s `placeholder` only ever reflected the team this case was
  // already assigned to. Controlling it properly fixes that for good, not just for the new
  // conflict-check flow.
  const [selectedTeamId, setSelectedTeamId] = useState(assignedTeamId ?? "");

  async function handleTeamChange(teamId: string | null) {
    if (!teamId) return;
    setSelectedTeamId(teamId);
    setCheck({ loading: true, result: null, error: null });
    try {
      const res = await fetch(`/api/cases/${caseId}/team-conflict-check?teamId=${teamId}`);
      const data = await res.json();
      if (!res.ok) {
        setCheck({ loading: false, result: null, error: data.error ?? "Unable to run the conflict check right now." });
        return;
      }
      setCheck({ loading: false, result: data, error: null });
    } catch {
      setCheck({ loading: false, result: null, error: "Unable to reach the server to run the conflict check." });
    }
  }

  return (
    <form action={action} className="space-y-2 border-t border-outline-variant pt-3">
      <Label className="text-xs font-bold uppercase">Reassign team</Label>
      <Select name="teamId" required value={selectedTeamId} onValueChange={handleTeamChange}>
        <SelectTrigger className="w-full"><SelectValue placeholder="Unassigned">{teams.find((t) => t.id === selectedTeamId)?.name ?? "Unassigned"}</SelectValue></SelectTrigger>
        <SelectContent>
          {teams.map((t) => (
            <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {check.loading && <p className="text-[11px] text-on-surface-variant">Checking for conflicts…</p>}
      {check.error && <p className="text-[11px] text-error">{check.error}</p>}
      {check.result && check.result.conflictedMembers.length > 0 && (
        <div className="flex flex-col gap-1 rounded-lg border border-error/30 bg-error-container/30 p-2.5 text-[11px] text-on-error-container">
          <span className="flex items-center gap-1 font-bold">
            <AlertTriangle size={12} strokeWidth={2} />
            {check.result.conflictedMembers.length} of {check.result.memberCount} team members are flagged on this case
          </span>
          <ul className="list-disc space-y-0.5 pl-4">
            {check.result.conflictedMembers.map((m) => (
              <li key={m.userId}>
                {m.fullName} ({m.flagType === "SUBJECT" ? "Subject" : "Conflict"})
                {m.reason && `: ${m.reason}`}
              </li>
            ))}
          </ul>
          <span>They&apos;ll be individually denied access to this case regardless of team assignment. You can still assign this team if the rest of it should work the case.</span>
        </div>
      )}
      {check.result && check.result.conflictedMembers.length === 0 && (
        <p className="text-[11px] text-tertiary">No conflicts. All {check.result.memberCount} team member(s) clear.</p>
      )}

      <SubmitButton size="sm" variant="outline">Assign</SubmitButton>
    </form>
  );
}
