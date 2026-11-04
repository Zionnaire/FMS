"use client";

import { useActionState, useState } from "react";
import { validateSignalAction } from "@/features/signals/actions";
import { COMPARTMENTS } from "@/features/auth/types";
import type { IncidentTaxonomyCategory } from "@/features/configuration/types";
import type { FormState } from "@/lib/form-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SubmitButton } from "@/components/shell/submit-button";

const initialState: FormState = {};

export function ValidateForm({ signalId, categories }: { signalId: string; categories: IncidentTaxonomyCategory[] }) {
  const [linking, setLinking] = useState(false);
  const [category, setCategory] = useState<string>("");
  const action = validateSignalAction.bind(null, signalId);
  const [state, formAction] = useActionState(action, initialState);
  const types = categories.find((c) => c.name === category)?.types ?? [];

  return (
    <form action={formAction} className="space-y-3">
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={linking} onChange={(e) => setLinking(e.target.checked)} />
        This corroborates an existing incident instead of creating a new one
      </label>

      {linking ? (
        <div>
          <Label htmlFor="linkToIncidentId" className="mb-1.5 text-xs">Existing incident id</Label>
          <Input id="linkToIncidentId" name="linkToIncidentId" placeholder="Incident id (UUID)" required />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Select name="category" required value={category} onValueChange={(value: string | null) => setCategory(value ?? "")}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select key={category} name="type" required disabled={!category}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                {types.map((t) => (
                  <SelectItem key={t.name} value={t.name}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Input name="title" placeholder="Incident title" required minLength={5} />
          <Textarea name="description" placeholder="Incident description" required minLength={5} />
          <Select name="compartment">
            <SelectTrigger className="w-full"><SelectValue placeholder="Compartment (defaults to STANDARD)" /></SelectTrigger>
            <SelectContent>
              {COMPARTMENTS.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      )}
      {state.error && (
        <p className="rounded-lg border border-error/30 bg-error-container/40 px-3 py-2 text-xs font-medium text-on-error-container">{state.error}</p>
      )}
      <SubmitButton pendingText="Validating…">Validate</SubmitButton>
    </form>
  );
}
