"use client";

import { useActionState, useState } from "react";
import { createSignalAction } from "@/features/signals/actions";
import { SIGNAL_SOURCES } from "@/features/signals/types";
import type { FormState } from "@/lib/form-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SubmitButton } from "@/components/shell/submit-button";

const initialState: FormState = {};

export function SignalForm() {
  const [state, formAction] = useActionState(createSignalAction, initialState);
  const [source, setSource] = useState<string>("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const isWhistleblower = source === "WHISTLEBLOWER";

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <Label className="mb-1.5 text-xs font-bold uppercase">Source</Label>
        <Select name="source" required value={source} onValueChange={(value: string | null) => setSource(value ?? "")}>
          <SelectTrigger className="w-full"><SelectValue placeholder="How was this reported?" /></SelectTrigger>
          <SelectContent>
            {SIGNAL_SOURCES.map((s) => (
              <SelectItem key={s} value={s}>{s.replaceAll("_", " ")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {state.fieldErrors?.source && <p className="mt-1 text-xs text-error">{state.fieldErrors.source}</p>}
      </div>

      <div>
        <Label htmlFor="summary" className="mb-1.5 text-xs font-bold uppercase">Summary</Label>
        <Textarea id="summary" name="summary" placeholder="Short description of what was reported" required minLength={5} />
        {state.fieldErrors?.summary && <p className="mt-1 text-xs text-error">{state.fieldErrors.summary}</p>}
      </div>

      <div>
        <Label htmlFor="externalRef" className="mb-1.5 text-xs font-bold uppercase">External reference (optional)</Label>
        <Input id="externalRef" name="externalRef" placeholder="Rule engine alert id, complaint ticket #, ..." />
      </div>

      {isWhistleblower && (
        <div className="space-y-3 rounded-lg border border-outline-variant bg-surface-container-low p-3">
          <p className="text-xs font-bold text-on-surface-variant uppercase">Whistleblower details</p>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" name="isAnonymous" checked={isAnonymous} onChange={(e) => setIsAnonymous(e.target.checked)} />
            Reporter wishes to remain anonymous
          </label>
          {!isAnonymous && (
            <div>
              <Label htmlFor="reporterName" className="mb-1.5 text-xs">Reporter name</Label>
              <Input id="reporterName" name="reporterName" />
            </div>
          )}
          <div>
            <Label htmlFor="reporterContact" className="mb-1.5 text-xs">Reporter contact (optional)</Label>
            <Input id="reporterContact" name="reporterContact" />
          </div>
        </div>
      )}

      {state.error && (
        <p className="rounded-lg border border-error/30 bg-error-container/40 px-3 py-2 text-xs font-medium text-on-error-container">{state.error}</p>
      )}

      <SubmitButton pendingText="Submitting…">Submit signal</SubmitButton>
    </form>
  );
}
