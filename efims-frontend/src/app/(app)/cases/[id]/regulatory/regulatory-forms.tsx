"use client";

import { useActionState } from "react";
import {
  createObligationAction,
  submitObligationAction,
  acknowledgeObligationAction,
  waiveObligationAction,
} from "@/features/regulatory/actions";
import { OBLIGATION_TYPES } from "@/features/regulatory/types";
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

export function NewObligationForm({ caseId }: { caseId: string }) {
  const action = createObligationAction.bind(null, caseId);
  const [state, formAction] = useActionState(action, initialState);
  return (
    <form action={formAction} className="space-y-2">
      <Select name="obligationType" required>
        <SelectTrigger className="w-full"><SelectValue placeholder="Type" /></SelectTrigger>
        <SelectContent>{OBLIGATION_TYPES.map((t) => (<SelectItem key={t} value={t}>{t.replaceAll("_", " ")}</SelectItem>))}</SelectContent>
      </Select>
      <Textarea name="description" placeholder="Description (min 10 chars)" required minLength={10} />
      <Input name="regulatorName" placeholder="Regulator (e.g. NFIU, CBN, optional)" />
      <Input name="deadline" type="datetime-local" required />
      <ErrorBanner state={state} />
      <SubmitButton size="sm" pendingText="Creating…">Create</SubmitButton>
    </form>
  );
}

export function SubmitObligationForm({ caseId, obligationId, availableApprovals }: { caseId: string; obligationId: string; availableApprovals: ApprovalRequest[] }) {
  const action = submitObligationAction.bind(null, caseId, obligationId);
  const [state, formAction] = useActionState(action, initialState);
  return (
    <div className="space-y-1">
      <form action={formAction} className="flex items-center gap-1.5">
        <Select name="approvalId" required>
          <SelectTrigger className="h-8 w-48 text-xs"><SelectValue placeholder="Approved request" /></SelectTrigger>
          <SelectContent>{availableApprovals.map((a) => (<SelectItem key={a.id} value={a.id}>{a.requestNotes.slice(0, 30)}</SelectItem>))}</SelectContent>
        </Select>
        <Input name="referenceNumber" placeholder="Reference #" className="h-8 w-32 text-xs" />
        <SubmitButton size="sm">Submit</SubmitButton>
      </form>
      <ErrorBanner state={state} />
    </div>
  );
}

export function WaiveObligationForm({ caseId, obligationId }: { caseId: string; obligationId: string }) {
  const action = waiveObligationAction.bind(null, caseId, obligationId);
  const [state, formAction] = useActionState(action, initialState);
  return (
    <div className="space-y-1">
      <form action={formAction} className="flex items-center gap-1.5">
        <Input name="reason" placeholder="Waive reason" className="h-8 text-xs" required minLength={5} />
        <SubmitButton size="sm" variant="outline">Waive</SubmitButton>
      </form>
      <ErrorBanner state={state} />
    </div>
  );
}

export function AcknowledgeObligationForm({ caseId, obligationId }: { caseId: string; obligationId: string }) {
  const action = acknowledgeObligationAction.bind(null, caseId, obligationId);
  const [state, formAction] = useActionState(action, initialState);
  return (
    <div className="space-y-1 border-t border-outline-variant pt-2">
      <form action={formAction} className="flex items-center gap-1.5">
        <Input name="acknowledgedRef" placeholder="Acknowledgment ref (optional)" className="h-8 text-xs" />
        <SubmitButton size="sm">Acknowledge</SubmitButton>
      </form>
      <ErrorBanner state={state} />
    </div>
  );
}
