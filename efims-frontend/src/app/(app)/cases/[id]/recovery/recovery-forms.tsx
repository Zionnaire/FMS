"use client";

import { useActionState } from "react";
import { recordLossAction, recordRecoveryAction, recordWriteOffAction } from "@/features/recovery/actions";
import { LOSS_CATEGORIES, RECOVERY_METHODS } from "@/features/recovery/types";
import type { ApprovalRequest } from "@/features/workflow/types";
import type { FormState } from "@/lib/form-state";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SubmitButton } from "@/components/shell/submit-button";

const initialState: FormState = {};

function ErrorBanner({ state }: { state: FormState }) {
  if (!state.error) return null;
  return <p className="rounded-lg border border-error/30 bg-error-container/40 px-3 py-2 text-xs font-medium text-on-error-container">{state.error}</p>;
}

export function LossForm({ caseId }: { caseId: string }) {
  const action = recordLossAction.bind(null, caseId);
  const [state, formAction] = useActionState(action, initialState);
  return (
    <form action={formAction} className="space-y-2">
      <Input name="amount" type="number" step="0.01" placeholder="Amount (NGN)" required />
      <Select name="category" required>
        <SelectTrigger className="w-full"><SelectValue placeholder="Category" /></SelectTrigger>
        <SelectContent>{LOSS_CATEGORIES.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}</SelectContent>
      </Select>
      <Input name="description" placeholder="Description (optional)" />
      <ErrorBanner state={state} />
      <SubmitButton size="sm" pendingText="Recording…">Record</SubmitButton>
    </form>
  );
}

export function RecoveryForm({ caseId }: { caseId: string }) {
  const action = recordRecoveryAction.bind(null, caseId);
  const [state, formAction] = useActionState(action, initialState);
  return (
    <form action={formAction} className="space-y-2">
      <Input name="amount" type="number" step="0.01" placeholder="Amount (NGN)" required />
      <Select name="method" required>
        <SelectTrigger className="w-full"><SelectValue placeholder="Method" /></SelectTrigger>
        <SelectContent>{RECOVERY_METHODS.map((m) => (<SelectItem key={m} value={m}>{m.replaceAll("_", " ")}</SelectItem>))}</SelectContent>
      </Select>
      <Input name="description" placeholder="Description (optional)" />
      <ErrorBanner state={state} />
      <SubmitButton size="sm" pendingText="Recording…">Record</SubmitButton>
    </form>
  );
}

export function WriteOffForm({ caseId, availableApprovals }: { caseId: string; availableApprovals: ApprovalRequest[] }) {
  const action = recordWriteOffAction.bind(null, caseId);
  const [state, formAction] = useActionState(action, initialState);
  return (
    <form action={formAction} className="space-y-2">
      <Select name="approvalId" required>
        <SelectTrigger className="w-full"><SelectValue placeholder="Approved request" /></SelectTrigger>
        <SelectContent>{availableApprovals.map((a) => (<SelectItem key={a.id} value={a.id}>{a.requestNotes.slice(0, 40)}</SelectItem>))}</SelectContent>
      </Select>
      <Input name="amount" type="number" step="0.01" placeholder="Amount (NGN)" required />
      <Input name="justification" placeholder="Justification (min 5 chars)" required minLength={5} />
      <ErrorBanner state={state} />
      <SubmitButton size="sm" pendingText="Recording…">Record</SubmitButton>
    </form>
  );
}
