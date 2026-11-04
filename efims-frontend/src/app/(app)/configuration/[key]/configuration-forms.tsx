"use client";

import { useActionState } from "react";
import { createConfigurationDraftAction, ratifyConfigurationVersionAction } from "@/features/configuration/actions";
import type { CdKey } from "@/features/configuration/types";
import type { FormState } from "@/lib/form-state";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/shell/submit-button";

const initialState: FormState = {};

function ErrorBanner({ state }: { state: FormState }) {
  if (!state.error) return null;
  return <p className="rounded-lg border border-error/30 bg-error-container/40 px-3 py-2 text-xs font-medium text-on-error-container">{state.error}</p>;
}

export function RatifyForm({ cdKey, version }: { cdKey: CdKey; version: number }) {
  const action = ratifyConfigurationVersionAction.bind(null, cdKey, version);
  const [state, formAction] = useActionState(action, initialState);
  return (
    <form action={formAction} className="mt-3 space-y-2 border-t border-outline-variant pt-3">
      <p className="text-xs font-bold text-on-surface-variant uppercase">Ratify this draft</p>
      <Input name="effectiveDate" type="datetime-local" placeholder="Effective date (defaults to now)" />
      <Input name="notes" placeholder="Notes (optional)" />
      <ErrorBanner state={state} />
      <SubmitButton size="sm" pendingText="Ratifying…">Ratify</SubmitButton>
    </form>
  );
}

export function CreateDraftForm({ cdKey, nextVersion, defaultValue }: { cdKey: CdKey; nextVersion: number; defaultValue: string }) {
  const action = createConfigurationDraftAction.bind(null, cdKey);
  const [state, formAction] = useActionState(action, initialState);
  return (
    <form action={formAction} className="space-y-2">
      <Textarea
        name="value"
        placeholder="Full JSON value"
        required
        rows={10}
        defaultValue={defaultValue}
        className="font-mono text-xs"
      />
      <Input name="notes" placeholder="Notes (optional)" />
      <ErrorBanner state={state} />
      <SubmitButton size="sm" pendingText="Saving…">Create draft (v{nextVersion})</SubmitButton>
    </form>
  );
}
