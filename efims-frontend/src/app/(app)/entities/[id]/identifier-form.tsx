"use client";

import { useActionState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SubmitButton } from "@/components/shell/submit-button";
import { ENTITY_IDENTIFIER_TYPES } from "@/features/entities/types";
import type { FormState } from "@/lib/form-state";

const initialState: FormState = {};

/** Extracted from `EntityDetailPage` (a Server Component) so a rejected identifier (e.g. a
 * malformed value for its type) shows inline instead of crashing the page — same fix as the
 * other entity-detail forms. */
export function IdentifierForm({ action }: { action: (prevState: FormState, formData: FormData) => Promise<FormState> }) {
  const [state, formAction] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-2 border-t border-outline-variant pt-3">
      <div className="flex items-end gap-2">
        <div>
          <Label className="mb-1 text-[10px] font-bold uppercase">Type</Label>
          <Select name="type" required defaultValue="BVN">
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ENTITY_IDENTIFIER_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1">
          <Label className="mb-1 text-[10px] font-bold uppercase">Value</Label>
          <Input name="value" required />
        </div>
        <SubmitButton size="sm" variant="outline">Add</SubmitButton>
      </div>
      {state.error && <p className="text-xs font-medium text-error">{state.error}</p>}
    </form>
  );
}
