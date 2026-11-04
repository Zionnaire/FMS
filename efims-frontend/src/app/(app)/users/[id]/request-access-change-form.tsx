"use client";

import { useActionState, useState } from "react";
import { requestAccessChangeAction } from "@/features/users/actions";
import { ROLES, COMPARTMENTS } from "@/features/auth/types";
import { ACCESS_CHANGE_TYPES, type AccessChangeType } from "@/features/users/types";
import type { FormState } from "@/lib/form-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SubmitButton } from "@/components/shell/submit-button";

const initialState: FormState = {};

const CHANGE_TYPE_LABELS: Record<AccessChangeType, string> = {
  ROLE_CHANGE: "Change role",
  GRANT_COMPARTMENT: "Grant compartment",
  REVOKE_COMPARTMENT: "Revoke compartment",
};

export function RequestAccessChangeForm({ userId }: { userId: string }) {
  const action = requestAccessChangeAction.bind(null, userId);
  const [state, formAction] = useActionState(action, initialState);
  const [changeType, setChangeType] = useState<AccessChangeType | "">("");

  return (
    <form action={formAction} className="space-y-3">
      <Select name="changeType" required value={changeType} onValueChange={(v: string | null) => setChangeType((v as AccessChangeType) ?? "")}>
        <SelectTrigger className="w-full"><SelectValue placeholder="Change type" /></SelectTrigger>
        <SelectContent>
          {ACCESS_CHANGE_TYPES.map((t) => (
            <SelectItem key={t} value={t}>{CHANGE_TYPE_LABELS[t]}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {changeType === "ROLE_CHANGE" && (
        <Select name="role" required>
          <SelectTrigger className="w-full"><SelectValue placeholder="New role" /></SelectTrigger>
          <SelectContent>
            {ROLES.map((r) => (
              <SelectItem key={r} value={r}>{r.replaceAll("_", " ")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {(changeType === "GRANT_COMPARTMENT" || changeType === "REVOKE_COMPARTMENT") && (
        <Select name="compartment" required>
          <SelectTrigger className="w-full"><SelectValue placeholder="Compartment" /></SelectTrigger>
          <SelectContent>
            {COMPARTMENTS.filter((c) => c !== "STANDARD").map((c) => (
              <SelectItem key={c} value={c}>{c.replaceAll("_", " ")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {changeType === "GRANT_COMPARTMENT" && (
        <div>
          <Label htmlFor="expiresAt" className="mb-1 text-[11px] font-semibold text-outline uppercase">Expires (optional — omit for a permanent grant)</Label>
          <Input id="expiresAt" name="expiresAt" type="datetime-local" />
        </div>
      )}

      <Textarea name="requestNotes" placeholder="Request notes (min 5 characters)" required minLength={5} />

      {state.error && (
        <p className="rounded-lg border border-error/30 bg-error-container/40 px-3 py-2 text-xs font-medium text-on-error-container">{state.error}</p>
      )}

      <SubmitButton size="sm" pendingText="Requesting…">Request change</SubmitButton>
    </form>
  );
}
