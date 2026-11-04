"use client";

import { useActionState } from "react";
import { createCaseAction } from "@/features/cases/actions";
import { COMPARTMENTS } from "@/features/auth/types";
import type { Team } from "@/features/teams/types";
import type { FormState } from "@/lib/form-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SubmitButton } from "@/components/shell/submit-button";

const initialState: FormState = {};

export function CaseForm({ teams }: { teams: Team[] }) {
  const [state, formAction] = useActionState(createCaseAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <Label htmlFor="title" className="mb-1.5 text-xs font-bold uppercase">Title</Label>
        <Input id="title" name="title" required minLength={5} />
        {state.fieldErrors?.title && <p className="mt-1 text-xs text-error">{state.fieldErrors.title}</p>}
      </div>
      <div>
        <Label htmlFor="description" className="mb-1.5 text-xs font-bold uppercase">Description</Label>
        <Textarea id="description" name="description" required minLength={10} />
        {state.fieldErrors?.description && <p className="mt-1 text-xs text-error">{state.fieldErrors.description}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="sensitivityLevel" className="mb-1.5 text-xs font-bold uppercase">Sensitivity (1-4)</Label>
          <Input id="sensitivityLevel" name="sensitivityLevel" type="number" min={1} max={4} defaultValue={1} required />
        </div>
        <div>
          <Label className="mb-1.5 text-xs font-bold uppercase">Compartment</Label>
          <Select name="compartment">
            <SelectTrigger className="w-full"><SelectValue placeholder="STANDARD" /></SelectTrigger>
            <SelectContent>
              {COMPARTMENTS.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label className="mb-1.5 text-xs font-bold uppercase">Assign team (optional)</Label>
        <Select name="assignedTeamId">
          <SelectTrigger className="w-full"><SelectValue placeholder="None" /></SelectTrigger>
          <SelectContent>
            {teams.map((team) => (
              <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="incidentIds" className="mb-1.5 text-xs font-bold uppercase">Link incidents (optional)</Label>
        <Input id="incidentIds" name="incidentIds" placeholder="Comma-separated incident ids" />
      </div>
      {state.error && (
        <p className="rounded-lg border border-error/30 bg-error-container/40 px-3 py-2 text-xs font-medium text-on-error-container">{state.error}</p>
      )}
      <SubmitButton pendingText="Creating…">Create case</SubmitButton>
    </form>
  );
}
