"use client";

import { useActionState } from "react";
import {
  createRootCauseAction,
  createCapaActionAction,
  completeCapaActionAction,
  cancelCapaActionAction,
  validateCapaActionAction,
} from "@/features/capa/actions";
import { CAPA_ACTION_TYPES, CAPA_VALIDATION_OUTCOMES } from "@/features/capa/types";
import type { UserProfile } from "@/features/users/types";
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

export function RootCauseForm({ caseId }: { caseId: string }) {
  const action = createRootCauseAction.bind(null, caseId);
  const [state, formAction] = useActionState(action, initialState);
  return (
    <form action={formAction} className="space-y-2 border-t border-outline-variant pt-3">
      <Textarea name="summary" placeholder="Summary (min 10 chars)" required minLength={10} />
      <Input name="analysisMethod" placeholder="Analysis method (e.g. FIVE_WHYS, optional)" />
      <ErrorBanner state={state} />
      <SubmitButton size="sm">Save</SubmitButton>
    </form>
  );
}

export function NewCapaActionForm({ caseId, rootCauseId, users }: { caseId: string; rootCauseId?: string; users: UserProfile[] }) {
  const action = createCapaActionAction.bind(null, caseId);
  const [state, formAction] = useActionState(action, initialState);
  return (
    <form action={formAction} className="space-y-2">
      {rootCauseId && <input type="hidden" name="rootCauseId" value={rootCauseId} />}
      <Select name="type" required>
        <SelectTrigger className="w-full"><SelectValue placeholder="Type" /></SelectTrigger>
        <SelectContent>{CAPA_ACTION_TYPES.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}</SelectContent>
      </Select>
      <Input name="title" placeholder="Title" required minLength={5} />
      <Textarea name="description" placeholder="Description (min 10 chars)" required minLength={10} />
      <Select name="ownerId" required>
        <SelectTrigger className="w-full"><SelectValue placeholder="Owner" /></SelectTrigger>
        <SelectContent>{users.map((u) => (<SelectItem key={u.id} value={u.id}>{u.fullName}</SelectItem>))}</SelectContent>
      </Select>
      <Input name="dueDate" type="date" required />
      <ErrorBanner state={state} />
      <SubmitButton size="sm">Create</SubmitButton>
    </form>
  );
}

export function CompleteCapaForm({ caseId, actionId }: { caseId: string; actionId: string }) {
  const action = completeCapaActionAction.bind(null, caseId, actionId);
  const [state, formAction] = useActionState(action, initialState);
  return (
    <div className="space-y-1">
      <form action={formAction} className="flex items-center gap-1.5">
        <Input name="completionNotes" placeholder="Completion notes (optional)" className="h-8 text-xs" />
        <SubmitButton size="sm">Complete</SubmitButton>
      </form>
      <ErrorBanner state={state} />
    </div>
  );
}

export function CancelCapaForm({ caseId, actionId }: { caseId: string; actionId: string }) {
  const action = cancelCapaActionAction.bind(null, caseId, actionId);
  const [state, formAction] = useActionState(action, initialState);
  return (
    <div className="space-y-1">
      <form action={formAction} className="flex items-center gap-1.5">
        <Input name="reason" placeholder="Reason" className="h-8 text-xs" required minLength={3} />
        <SubmitButton size="sm" variant="destructive">Cancel</SubmitButton>
      </form>
      <ErrorBanner state={state} />
    </div>
  );
}

export function ValidateCapaForm({ caseId, actionId }: { caseId: string; actionId: string }) {
  const action = validateCapaActionAction.bind(null, caseId, actionId);
  const [state, formAction] = useActionState(action, initialState);
  return (
    <div className="space-y-1">
      <form action={formAction} className="flex items-center gap-1.5">
        <Select name="outcome" required>
          <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Outcome" /></SelectTrigger>
          <SelectContent>{CAPA_VALIDATION_OUTCOMES.map((o) => (<SelectItem key={o} value={o}>{o.replaceAll("_", " ")}</SelectItem>))}</SelectContent>
        </Select>
        <SubmitButton size="sm">Validate</SubmitButton>
      </form>
      {/* Most likely error here: "The action owner cannot validate their own work" — the
         independence check CapaService.validate added 2026-10-14. */}
      <ErrorBanner state={state} />
    </div>
  );
}
