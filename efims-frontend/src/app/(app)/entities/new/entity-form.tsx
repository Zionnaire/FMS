"use client";

import { useActionState } from "react";
import { createEntityAction } from "@/features/entities/actions";
import type { FormState } from "@/lib/form-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SubmitButton } from "@/components/shell/submit-button";

const initialState: FormState = {};

export function EntityForm() {
  const [state, formAction] = useActionState(createEntityAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <Label className="mb-1.5 text-xs font-bold uppercase">Type</Label>
        <Select name="type" defaultValue="PERSON">
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="PERSON">Person</SelectItem>
            <SelectItem value="COMPANY">Company</SelectItem>
            <SelectItem value="ACCOUNT">Account</SelectItem>
          </SelectContent>
        </Select>
        {state.fieldErrors?.type && <p className="mt-1 text-xs text-error">{state.fieldErrors.type}</p>}
      </div>
      <div>
        <Label htmlFor="displayName" className="mb-1.5 text-xs font-bold uppercase">Name</Label>
        <Input id="displayName" name="displayName" required placeholder="e.g. Apex Synergy Logistics Ltd" />
        {state.fieldErrors?.displayName && <p className="mt-1 text-xs text-error">{state.fieldErrors.displayName}</p>}
      </div>
      {state.error && <p className="text-xs text-error">{state.error}</p>}
      <SubmitButton pendingText="Creating…">Create entity</SubmitButton>
    </form>
  );
}
