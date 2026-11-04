"use client";

import { useActionState } from "react";
import { createUserAction } from "@/features/users/actions";
import { ROLES } from "@/features/auth/types";
import { COMPARTMENTS } from "@/features/auth/types";
import type { FormState } from "@/lib/form-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SubmitButton } from "@/components/shell/submit-button";

const initialState: FormState = {};

export function UserForm() {
  const [state, formAction] = useActionState(createUserAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <Label htmlFor="fullName" className="mb-1.5 text-xs font-bold uppercase">Full name</Label>
        <Input id="fullName" name="fullName" required />
        {state.fieldErrors?.fullName && <p className="mt-1 text-xs text-error">{state.fieldErrors.fullName}</p>}
      </div>
      <div>
        <Label htmlFor="email" className="mb-1.5 text-xs font-bold uppercase">Email</Label>
        <Input id="email" name="email" type="email" required />
        {state.fieldErrors?.email && <p className="mt-1 text-xs text-error">{state.fieldErrors.email}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="mb-1.5 text-xs font-bold uppercase">Role</Label>
          <Select name="role" required>
            <SelectTrigger className="w-full"><SelectValue placeholder="Role" /></SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => (
                <SelectItem key={r} value={r}>{r.replaceAll("_", " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {state.fieldErrors?.role && <p className="mt-1 text-xs text-error">{state.fieldErrors.role}</p>}
        </div>
        <div>
          <Label htmlFor="clearanceLevel" className="mb-1.5 text-xs font-bold uppercase">Clearance (1-4)</Label>
          <Input id="clearanceLevel" name="clearanceLevel" type="number" min={1} max={4} defaultValue={1} required />
          {state.fieldErrors?.clearanceLevel && <p className="mt-1 text-xs text-error">{state.fieldErrors.clearanceLevel}</p>}
        </div>
      </div>
      <div>
        <Label className="mb-1.5 text-xs font-bold uppercase">Compartments (optional — STANDARD is visible to everyone by default)</Label>
        <div className="grid grid-cols-3 gap-2 rounded-lg border border-outline-variant/40 p-3">
          {COMPARTMENTS.filter((c) => c !== "STANDARD").map((c) => (
            <label key={c} className="flex items-center gap-1.5 text-xs text-on-surface">
              <input type="checkbox" name="compartments" value={c} />
              {c.replaceAll("_", " ")}
            </label>
          ))}
        </div>
      </div>
      <div>
        <Label htmlFor="temporaryPassword" className="mb-1.5 text-xs font-bold uppercase">Temporary password</Label>
        <Input id="temporaryPassword" name="temporaryPassword" type="password" minLength={8} required />
        {state.fieldErrors?.temporaryPassword && <p className="mt-1 text-xs text-error">{state.fieldErrors.temporaryPassword}</p>}
      </div>

      {state.error && (
        <p className="rounded-lg border border-error/30 bg-error-container/40 px-3 py-2 text-xs font-medium text-on-error-container">{state.error}</p>
      )}

      <SubmitButton pendingText="Creating…">Create user</SubmitButton>
    </form>
  );
}
