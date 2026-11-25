"use client";

import { useActionState, useState } from "react";
import { Plus, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SubmitButton } from "@/components/shell/submit-button";
import { RISK_BANDS, RISK_BAND_LABEL, type RiskFactor } from "@/features/entities/types";
import type { FormState } from "@/lib/form-state";

const EMPTY_FACTOR: RiskFactor = { label: "", weight: 50, rationale: "" };
const initialState: FormState = {};

/** Analyst-entered weighted factors — never a vendor payload (see EntityRiskAssessment's own
 * schema.prisma doc comment on why `source` stays MANUAL). Dynamic add/remove needs client state
 * before submit, so the working array is serialized into one hidden JSON field rather than N
 * separate inputs — see `recordRiskAssessmentAction`'s own doc comment. `useActionState` shows a
 * rejected submission (e.g. a factor with a label but no rationale) inline instead of crashing
 * the whole page — found live 2026-11-24, same class of bug as the SLA clock incident. */
export function RiskAssessmentForm({ action }: { action: (prevState: FormState, formData: FormData) => Promise<FormState> }) {
  const [factors, setFactors] = useState<RiskFactor[]>([{ ...EMPTY_FACTOR }]);
  const [state, formAction] = useActionState(action, initialState);

  function updateFactor(index: number, patch: Partial<RiskFactor>) {
    setFactors((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <Label className="mb-1 text-[10px] font-bold uppercase">Risk band</Label>
        <Select name="band" required defaultValue="S3">
          <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            {RISK_BANDS.map((b) => (
              <SelectItem key={b} value={b}>{RISK_BAND_LABEL[b]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className="text-[10px] font-bold uppercase">Weighted factors</Label>
        {factors.map((factor, i) => (
          <div key={i} className="grid grid-cols-1 gap-2 rounded-lg border border-outline-variant p-2.5 sm:grid-cols-[1fr_80px_1fr_auto]">
            <Input
              placeholder="Factor (e.g. Beneficial ownership opacity)"
              value={factor.label}
              onChange={(e) => updateFactor(i, { label: e.target.value })}
              required
            />
            <Input
              type="number"
              min={0}
              max={100}
              placeholder="Weight"
              value={factor.weight}
              onChange={(e) => updateFactor(i, { weight: Number(e.target.value) })}
            />
            <Input
              placeholder="Rationale"
              value={factor.rationale}
              onChange={(e) => updateFactor(i, { rationale: e.target.value })}
              required
            />
            <button
              type="button"
              onClick={() => setFactors((prev) => prev.filter((_, idx) => idx !== i))}
              disabled={factors.length === 1}
              className="rounded-md p-1.5 text-on-surface-variant hover:bg-surface-container disabled:opacity-30"
              aria-label="Remove factor"
            >
              <X size={14} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setFactors((prev) => [...prev, { ...EMPTY_FACTOR }])}
          className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
        >
          <Plus size={12} strokeWidth={2.5} />
          Add factor
        </button>
      </div>

      <input type="hidden" name="factors" value={JSON.stringify(factors.filter((f) => f.label.trim()))} />
      {state.error && <p className="text-xs font-medium text-error">{state.error}</p>}
      <SubmitButton size="sm" variant="outline" pendingText="Recording…">Record risk assessment</SubmitButton>
    </form>
  );
}
