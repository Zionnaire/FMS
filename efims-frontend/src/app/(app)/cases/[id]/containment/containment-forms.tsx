"use client";

import { useActionState } from "react";
import {
  createContainmentRequestAction,
  confirmContainmentRequestAction,
  rejectContainmentRequestAction,
  cancelContainmentRequestAction,
} from "@/features/containment/actions";
import { CONTAINMENT_ACTION_TYPES } from "@/features/containment/types";
import type { ApprovalRequest } from "@/features/workflow/types";
import type { FormState } from "@/lib/form-state";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SubmitButton } from "@/components/shell/submit-button";

const initialState: FormState = {};

function ErrorBanner({ state }: { state: FormState }) {
  if (!state.error) return null;
  return <p className="rounded-lg border border-error/30 bg-error-container/40 px-3 py-2 text-xs font-medium text-on-error-container">{state.error}</p>;
}

export function RequestContainmentForm({ caseId, availableApprovals }: { caseId: string; availableApprovals: ApprovalRequest[] }) {
  const action = createContainmentRequestAction.bind(null, caseId);
  const [state, formAction] = useActionState(action, initialState);
  return (
    <form action={formAction} className="space-y-2">
      <Select name="approvalId" required>
        <SelectTrigger className="w-full"><SelectValue placeholder="Approved request" /></SelectTrigger>
        <SelectContent>
          {availableApprovals.map((a) => (<SelectItem key={a.id} value={a.id}>{a.requestNotes.slice(0, 40)}</SelectItem>))}
        </SelectContent>
      </Select>
      <Select name="actionType" required>
        <SelectTrigger className="w-full"><SelectValue placeholder="Action type" /></SelectTrigger>
        <SelectContent>
          {CONTAINMENT_ACTION_TYPES.map((t) => (<SelectItem key={t} value={t}>{t.replaceAll("_", " ")}</SelectItem>))}
        </SelectContent>
      </Select>
      <Input name="targetDescription" placeholder="Target (account, card, ...)" required minLength={2} />
      <Textarea name="rationale" placeholder="Rationale (min 5 chars)" required minLength={5} />
      <ErrorBanner state={state} />
      <SubmitButton size="sm" pendingText="Requesting…">Request</SubmitButton>
    </form>
  );
}

export function ConfirmContainmentForm({ caseId, requestId }: { caseId: string; requestId: string }) {
  const action = confirmContainmentRequestAction.bind(null, caseId, requestId);
  const [state, formAction] = useActionState(action, initialState);
  return (
    <div className="space-y-1">
      <form action={formAction} className="flex items-center gap-1.5">
        <Input name="confirmationRef" placeholder="Confirmation ref (optional)" className="h-8 text-xs" />
        <SubmitButton size="sm">Confirm</SubmitButton>
      </form>
      <ErrorBanner state={state} />
    </div>
  );
}

export function RejectContainmentForm({ caseId, requestId }: { caseId: string; requestId: string }) {
  const action = rejectContainmentRequestAction.bind(null, caseId, requestId);
  const [state, formAction] = useActionState(action, initialState);
  return (
    <div className="space-y-1">
      <form action={formAction} className="flex items-center gap-1.5">
        <Input name="reason" placeholder="Reason" className="h-8 text-xs" required minLength={3} />
        <SubmitButton size="sm" variant="destructive">Reject</SubmitButton>
      </form>
      <ErrorBanner state={state} />
    </div>
  );
}

export function CancelContainmentForm({ caseId, requestId }: { caseId: string; requestId: string }) {
  const action = cancelContainmentRequestAction.bind(null, caseId, requestId);
  const [state, formAction] = useActionState(action, initialState);
  return (
    <div className="space-y-1">
      <form action={formAction} className="flex items-center gap-1.5">
        <Input name="reason" placeholder="Reason" className="h-8 text-xs" required minLength={3} />
        <SubmitButton size="sm" variant="outline">Cancel</SubmitButton>
      </form>
      <ErrorBanner state={state} />
    </div>
  );
}
