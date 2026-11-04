"use client";

import { useActionState } from "react";
import {
  createInvestigationPlanAction,
  raiseIssueAction,
  resolveIssueAction,
  recordInterviewAction,
  recordFindingAction,
} from "@/features/investigations/actions";
import { INTERVIEWEE_ROLES } from "@/features/investigations/types";
import type { InvestigationIssue } from "@/features/investigations/types";
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

export function PlanForm({ caseId, hasExistingPlan }: { caseId: string; hasExistingPlan: boolean }) {
  const action = createInvestigationPlanAction.bind(null, caseId);
  const [state, formAction] = useActionState(action, initialState);
  return (
    <form action={formAction} className="space-y-2 border-t border-outline-variant pt-3">
      <p className="text-xs font-bold text-on-surface-variant uppercase">{hasExistingPlan ? "New revision" : "Create plan"}</p>
      <Textarea name="objectives" placeholder="Objectives (min 10 chars)" required minLength={10} />
      <Textarea name="scope" placeholder="Scope (min 10 chars)" required minLength={10} />
      <ErrorBanner state={state} />
      <SubmitButton size="sm">Save plan</SubmitButton>
    </form>
  );
}

export function IssueForm({ caseId }: { caseId: string }) {
  const action = raiseIssueAction.bind(null, caseId);
  const [state, formAction] = useActionState(action, initialState);
  return (
    <form action={formAction} className="space-y-2 border-t border-outline-variant pt-3">
      <Input name="title" placeholder="Issue title" required minLength={5} />
      <Textarea name="description" placeholder="Description (min 10 chars)" required minLength={10} />
      <ErrorBanner state={state} />
      <SubmitButton size="sm" variant="outline">Raise issue</SubmitButton>
    </form>
  );
}

export function ResolveIssueForm({ caseId, issue }: { caseId: string; issue: InvestigationIssue }) {
  const action = resolveIssueAction.bind(null, caseId, issue.id);
  const [state, formAction] = useActionState(action, initialState);
  return (
    <div className="space-y-1 pt-1">
      <form action={formAction} className="flex gap-2">
        <Input name="resolution" placeholder="Resolution (min 10 chars)" className="h-8 text-xs" required minLength={10} />
        <SubmitButton size="sm" variant="outline">Resolve</SubmitButton>
      </form>
      <ErrorBanner state={state} />
    </div>
  );
}

export function InterviewForm({ caseId }: { caseId: string }) {
  const action = recordInterviewAction.bind(null, caseId);
  const [state, formAction] = useActionState(action, initialState);
  return (
    <form action={formAction} className="space-y-2 border-t border-outline-variant pt-3">
      <div className="grid grid-cols-2 gap-2">
        <Input name="intervieweeName" placeholder="Interviewee name" required minLength={2} />
        <Select name="intervieweeRole" required>
          <SelectTrigger className="w-full"><SelectValue placeholder="Role" /></SelectTrigger>
          <SelectContent>
            {INTERVIEWEE_ROLES.map((r) => (<SelectItem key={r} value={r}>{r}</SelectItem>))}
          </SelectContent>
        </Select>
      </div>
      <Input name="conductedAt" type="datetime-local" required />
      <Textarea name="summary" placeholder="Summary (min 10 chars)" required minLength={10} />
      <ErrorBanner state={state} />
      <SubmitButton size="sm" variant="outline">Record interview</SubmitButton>
    </form>
  );
}

export function FindingForm({ caseId, openIssues }: { caseId: string; openIssues: InvestigationIssue[] }) {
  const action = recordFindingAction.bind(null, caseId);
  const [state, formAction] = useActionState(action, initialState);
  return (
    <form action={formAction} className="space-y-2 border-t border-outline-variant pt-3">
      <Input name="title" placeholder="Finding title" required minLength={5} />
      <Textarea name="description" placeholder="Description (min 10 chars)" required minLength={10} />
      <Input name="supportingEvidence" placeholder="Supporting evidence (optional)" />
      {openIssues.length > 0 && (
        <Select name="resolvesIssueId">
          <SelectTrigger className="w-full"><SelectValue placeholder="Resolves issue (optional)" /></SelectTrigger>
          <SelectContent>
            {openIssues.map((i) => (<SelectItem key={i.id} value={i.id}>{i.title}</SelectItem>))}
          </SelectContent>
        </Select>
      )}
      <ErrorBanner state={state} />
      <SubmitButton size="sm" variant="outline">Record finding</SubmitButton>
    </form>
  );
}
