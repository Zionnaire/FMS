"use client";

import { useActionState } from "react";
import { requestApprovalAction, decideApprovalAction } from "@/features/workflow/actions";
import { APPROVAL_ACTIONS, SEVERITY_BANDS } from "@/features/workflow/types";
import type { FormState } from "@/lib/form-state";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SubmitButton } from "@/components/shell/submit-button";

const initialState: FormState = {};

function ErrorBanner({ state }: { state: FormState }) {
  if (!state.error) return null;
  return <p className="rounded-lg border border-error/30 bg-error-container/40 px-3 py-2 text-xs font-medium text-on-error-container">{state.error}</p>;
}

export function RequestApprovalForm({ caseId }: { caseId: string }) {
  const action = requestApprovalAction.bind(null, caseId);
  const [state, formAction] = useActionState(action, initialState);
  return (
    <form action={formAction} className="space-y-2">
      <Select name="action" required>
        <SelectTrigger className="w-full"><SelectValue placeholder="Action" /></SelectTrigger>
        <SelectContent>
          {APPROVAL_ACTIONS.map((a) => (
            <SelectItem key={a} value={a}>{a.replaceAll("_", " ")}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select name="severityBand" required>
        <SelectTrigger className="w-full"><SelectValue placeholder="Severity band" /></SelectTrigger>
        <SelectContent>
          {SEVERITY_BANDS.map((b) => (
            <SelectItem key={b} value={b}>{b.replace("_", "/")}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Textarea name="requestNotes" placeholder="Request notes (min 10 characters)" required minLength={10} />
      <ErrorBanner state={state} />
      <SubmitButton size="sm" pendingText="Requesting…">Request</SubmitButton>
    </form>
  );
}

export function DecideApprovalForm({ caseId, approvalId }: { caseId: string; approvalId: string }) {
  const approveAction = decideApprovalAction.bind(null, caseId, approvalId, true);
  const rejectAction = decideApprovalAction.bind(null, caseId, approvalId, false);
  const [approveState, approveFormAction] = useActionState(approveAction, initialState);
  const [rejectState, rejectFormAction] = useActionState(rejectAction, initialState);

  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <form action={approveFormAction} className="flex items-center gap-2">
          <input type="hidden" name="decisionNotes" value="Approved" />
          <SubmitButton size="sm">Approve</SubmitButton>
        </form>
        <form action={rejectFormAction}>
          <input type="hidden" name="decisionNotes" value="Rejected" />
          <SubmitButton size="sm" variant="destructive">Reject</SubmitButton>
        </form>
      </div>
      <ErrorBanner state={approveState} />
      <ErrorBanner state={rejectState} />
    </div>
  );
}
