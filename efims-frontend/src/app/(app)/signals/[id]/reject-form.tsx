"use client";

import { useActionState } from "react";
import { rejectSignalAction } from "@/features/signals/actions";
import type { FormState } from "@/lib/form-state";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/shell/submit-button";

const initialState: FormState = {};

export function RejectForm({ signalId }: { signalId: string }) {
  const action = rejectSignalAction.bind(null, signalId);
  const [state, formAction] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-2">
      <Input name="reason" placeholder="Rejection reason (min 5 characters)" required minLength={5} />
      {state.error && (
        <p className="rounded-lg border border-error/30 bg-error-container/40 px-3 py-2 text-xs font-medium text-on-error-container">{state.error}</p>
      )}
      <SubmitButton size="sm" variant="destructive">Reject</SubmitButton>
    </form>
  );
}
