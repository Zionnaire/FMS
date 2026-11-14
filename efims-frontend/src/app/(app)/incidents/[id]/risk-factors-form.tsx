"use client";

import { useActionState } from "react";
import { updateRiskFactorsAction } from "@/features/incidents/actions";
import { INCIDENT_CHANNELS, REPORTED_BY_TYPES, type Incident } from "@/features/incidents/types";
import type { FormState } from "@/lib/form-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SubmitButton } from "@/components/shell/submit-button";

const initialState: FormState = {};

const TRI_STATE_FIELDS = [
  { name: "ongoingThreat", label: "Ongoing threat" },
  { name: "insiderInvolvement", label: "Insider involvement" },
  { name: "dataCompromise", label: "Data compromise" },
  { name: "regulatoryRelevance", label: "Regulatory relevance" },
] as const;

/** Tri-state (Unknown / Yes / No) `<select>`s, not checkboxes — see `updateRiskFactorsAction`'s
 * own doc comment for why a checkbox can't safely represent "not yet known" without risking a
 * silent reset of an already-recorded `true` back to `false` on the next unrelated resubmit. */
export function RiskFactorsForm({ incidentId, incident }: { incidentId: string; incident: Incident }) {
  const action = updateRiskFactorsAction.bind(null, incidentId);
  const [state, formAction] = useActionState(action, initialState);

  const triStateDefault = (value: boolean | null) => (value === null ? "" : String(value));

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <Label className="text-[11px] text-on-surface-variant uppercase">Financial exposure (NGN)</Label>
          <Input name="financialExposureNgn" type="number" min={0} step="0.01" defaultValue={incident.financialExposureNgn ?? ""} />
        </div>
        <div>
          <Label className="text-[11px] text-on-surface-variant uppercase">Customer impact count</Label>
          <Input name="customerImpactCount" type="number" min={0} defaultValue={incident.customerImpactCount ?? ""} />
        </div>
        <div>
          <Label className="text-[11px] text-on-surface-variant uppercase">Channel</Label>
          <Select name="channel" defaultValue={incident.channel ?? undefined}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Unknown" /></SelectTrigger>
            <SelectContent>
              {INCIDENT_CHANNELS.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[11px] text-on-surface-variant uppercase">Reported by</Label>
          <Select name="reportedByType" defaultValue={incident.reportedByType ?? undefined}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Unknown" /></SelectTrigger>
            <SelectContent>
              {REPORTED_BY_TYPES.map((r) => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {TRI_STATE_FIELDS.map((f) => (
          <div key={f.name}>
            <Label className="text-[11px] text-on-surface-variant uppercase">{f.label}</Label>
            <Select name={f.name} defaultValue={triStateDefault(incident[f.name as keyof Incident] as boolean | null)}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Unknown" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Yes</SelectItem>
                <SelectItem value="false">No</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

      {state.error && <p className="text-xs font-medium text-error">{state.error}</p>}
      <SubmitButton size="sm" pendingText="Saving…">Save risk factors</SubmitButton>
    </form>
  );
}
