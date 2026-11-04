"use client";

import { useActionState } from "react";
import { ingestEvidenceAction, recordCustodyEventAction, setLegalHoldAction } from "@/features/evidence/actions";
import { EVIDENCE_CATEGORIES, CUSTODY_ACTIONS } from "@/features/evidence/types";
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

export function IngestForm({ caseId }: { caseId: string }) {
  const action = ingestEvidenceAction.bind(null, caseId);
  const [state, formAction] = useActionState(action, initialState);
  return (
    <form action={formAction} className="space-y-2">
      <Select name="category" required>
        <SelectTrigger className="w-full"><SelectValue placeholder="Category" /></SelectTrigger>
        <SelectContent>
          {EVIDENCE_CATEGORIES.map((c) => (<SelectItem key={c} value={c}>{c.replaceAll("_", " ")}</SelectItem>))}
        </SelectContent>
      </Select>
      <Input name="title" placeholder="Title" required minLength={2} />
      <Textarea name="description" placeholder="Description (optional)" />
      <Input name="externalRef" placeholder="External ref (DMS path, S3 key, ...)" />
      <Input name="sourceSystem" placeholder="Source system (optional)" />
      <Textarea name="content" placeholder="Content to hash (stand-in for a file upload)" required />
      <ErrorBanner state={state} />
      <SubmitButton size="sm" pendingText="Ingesting…">Ingest</SubmitButton>
    </form>
  );
}

export function CustodyForm({ caseId, evidenceId }: { caseId: string; evidenceId: string }) {
  const action = recordCustodyEventAction.bind(null, caseId, evidenceId);
  const [state, formAction] = useActionState(action, initialState);
  return (
    <div className="space-y-1">
      <form action={formAction} className="flex items-center gap-2">
        <Select name="action" required>
          <SelectTrigger className="h-8 w-full text-xs"><SelectValue placeholder="Custody action" /></SelectTrigger>
          <SelectContent>
            {CUSTODY_ACTIONS.map((a) => (<SelectItem key={a} value={a}>{a}</SelectItem>))}
          </SelectContent>
        </Select>
        <SubmitButton size="sm" variant="outline">Log</SubmitButton>
      </form>
      <ErrorBanner state={state} />
    </div>
  );
}

export function LegalHoldForm({ caseId, evidenceId, legalHold }: { caseId: string; evidenceId: string; legalHold: boolean }) {
  const action = setLegalHoldAction.bind(null, caseId, evidenceId, !legalHold);
  const [state, formAction] = useActionState(action, initialState);
  return (
    <div className="space-y-1">
      <form action={formAction} className="flex items-center gap-2">
        <Input name="reason" placeholder={legalHold ? "Release reason (optional)" : "Hold reason (optional)"} className="h-8 text-xs" />
        <SubmitButton size="sm" variant={legalHold ? "outline" : "destructive"}>{legalHold ? "Release hold" : "Set legal hold"}</SubmitButton>
      </form>
      <ErrorBanner state={state} />
    </div>
  );
}
