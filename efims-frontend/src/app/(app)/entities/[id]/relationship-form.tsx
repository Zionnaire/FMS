"use client";

import { useActionState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SubmitButton } from "@/components/shell/submit-button";
import { ENTITY_RELATIONSHIP_TYPES } from "@/features/entities/types";
import type { Entity } from "@/features/entities/types";
import type { FormState } from "@/lib/form-state";

const initialState: FormState = {};

export function RelationshipForm({
  candidates,
  action,
}: {
  candidates: Entity[];
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(action, initialState);

  if (candidates.length === 0) {
    return <p className="text-xs text-on-surface-variant">Create another entity first to relate it to this one.</p>;
  }

  return (
    <form action={formAction} className="grid grid-cols-1 gap-2.5 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
      <div>
        <Label className="mb-1 text-[10px] font-bold uppercase">Related entity</Label>
        <Select name="toEntityId" required>
          <SelectTrigger className="w-full"><SelectValue placeholder="Choose…" /></SelectTrigger>
          <SelectContent>
            {candidates.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.displayName} ({c.type})</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="mb-1 text-[10px] font-bold uppercase">Relationship</Label>
        <Select name="relationshipType" required defaultValue="ASSOCIATE">
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {ENTITY_RELATIONSHIP_TYPES.map((t) => (
              <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="mb-1 text-[10px] font-bold uppercase">Rationale (optional)</Label>
        <Input name="rationale" placeholder="e.g. 65% equity, CAC filing" />
      </div>
      <SubmitButton size="sm" variant="outline">Add link</SubmitButton>
      {state.error && <p className="text-xs font-medium text-error sm:col-span-4">{state.error}</p>}
    </form>
  );
}
