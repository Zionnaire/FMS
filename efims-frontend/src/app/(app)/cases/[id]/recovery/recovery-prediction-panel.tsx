"use client";

import { useState } from "react";
import { Flag } from "lucide-react";
import type { RecoverySuggestion } from "@/features/recovery/types";
import { RECOVERY_CHANNELS, RECOVERY_FRAUD_TYPES } from "@/features/recovery/types";
import { SEVERITY_TIERS } from "@/features/triage/types";
import { PredictionDecisionControls } from "@/components/shell/prediction-decision-controls";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SubmitButton } from "@/components/shell/submit-button";

/** Click-to-fetch, never auto-fills anything, disclaimer always shown — same interaction shape
 * as `SeveritySuggestionPanel`. `gross_actual_loss_ngn`/`containment_confirmed` are derived from
 * real case data server-side (see `RecoveryService.predictRecovery`'s own doc comment) — this
 * form only asks for the 4 fields EFIMS doesn't model. */
export function RecoveryPredictionPanel({ caseId }: { caseId: string }) {
  const [severity, setSeverity] = useState("");
  const [fraudType, setFraudType] = useState("");
  const [channel, setChannel] = useState("");
  const [daysToDetection, setDaysToDetection] = useState("");
  const [state, setState] = useState<{ loading: boolean; result: RecoverySuggestion | null; error: string | null }>({
    loading: false,
    result: null,
    error: null,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState({ loading: true, result: null, error: null });
    try {
      const res = await fetch(`/api/cases/${caseId}/recovery-predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ severity, fraudType, channel, daysToDetection: Number(daysToDetection) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setState({ loading: false, result: null, error: data.error ?? "Unable to get a prediction right now." });
        return;
      }
      setState({ loading: false, result: data, error: null });
    } catch {
      setState({ loading: false, result: null, error: "Unable to reach the AI prediction service." });
    }
  }

  return (
    <div className="space-y-3">
      <form onSubmit={submit} className="grid grid-cols-2 gap-2">
        <Select value={severity} onValueChange={(v) => setSeverity(v ?? "")}>
          <SelectTrigger className="w-full"><SelectValue placeholder="Severity" /></SelectTrigger>
          <SelectContent>
            {SEVERITY_TIERS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={fraudType} onValueChange={(v) => setFraudType(v ?? "")}>
          <SelectTrigger className="w-full"><SelectValue placeholder="Fraud type" /></SelectTrigger>
          <SelectContent>
            {RECOVERY_FRAUD_TYPES.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={channel} onValueChange={(v) => setChannel(v ?? "")}>
          <SelectTrigger className="w-full"><SelectValue placeholder="Channel" /></SelectTrigger>
          <SelectContent>
            {RECOVERY_CHANNELS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <div>
          <Label className="sr-only">Days to detection</Label>
          <Input type="number" min={0} step="0.1" placeholder="Days to detection" value={daysToDetection} onChange={(e) => setDaysToDetection(e.target.value)} required />
        </div>
        <div className="col-span-2">
          <SubmitButton size="sm" pendingText="Predicting…">Predict recovery</SubmitButton>
        </div>
      </form>

      {state.loading && <p className="text-xs text-on-surface-variant">Asking the model…</p>}
      {state.error && <p className="text-xs text-error">{state.error}</p>}
      {state.result && (
        <div className="space-y-2 rounded-xl border border-tertiary/30 bg-tertiary-container/20 p-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-surface-container-lowest px-2.5 py-1 text-xs font-bold text-on-surface">
              {Math.round(state.result.recoveryProbability * 100)}% recovery probability
            </span>
            <span className={state.result.recoverySuccessPrediction ? "font-semibold text-tertiary" : "font-semibold text-error"}>
              {state.result.recoverySuccessPrediction ? "Likely recoverable" : "Unlikely recoverable"}
            </span>
          </div>
          {state.result.requiresHumanReview && (
            <p className="flex items-center gap-1 text-[11px] font-semibold text-error">
              <Flag size={12} />
              Flagged for human review.
            </p>
          )}
          {state.result.recommendedActions.length > 0 && (
            <ul className="list-disc space-y-1 pl-4 text-on-surface">
              {state.result.recommendedActions.map((a) => <li key={a}>{a}</li>)}
            </ul>
          )}
          <p className="border-t border-outline-variant/30 pt-2 text-[11px] text-on-surface-variant">{state.result.disclaimer}</p>
          <PredictionDecisionControls key={state.result.predictionId} predictionId={state.result.predictionId} />
        </div>
      )}
    </div>
  );
}
