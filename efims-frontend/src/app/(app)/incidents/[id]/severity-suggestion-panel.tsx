"use client";

import { useState } from "react";
import type { SeveritySuggestion } from "@/features/triage/api";
import { StatusBadge } from "@/components/shell/status-badge";
import { Button } from "@/components/ui/button";

/** CD-08 Phase 2 advisory severity suggestion, surfaced next to the human's own severity picker
 * on the assess/escalate form below it — never prefills or auto-selects anything. "Advisory
 * score + confidence + cited factors only; human sets final severity" (CD-08's own guardrail,
 * implemented literally here, not just in the backend). */
export function SeveritySuggestionPanel({ incidentId }: { incidentId: string }) {
  const [state, setState] = useState<{ loading: boolean; result: SeveritySuggestion | null; error: string | null }>({
    loading: false,
    result: null,
    error: null,
  });

  async function fetchSuggestion() {
    setState({ loading: true, result: null, error: null });
    try {
      const res = await fetch(`/api/incidents/${incidentId}/severity-suggestion`);
      const data = await res.json();
      if (!res.ok) {
        setState({ loading: false, result: null, error: data.error ?? "Unable to get a suggestion right now." });
        return;
      }
      setState({ loading: false, result: data, error: null });
    } catch {
      setState({ loading: false, result: null, error: "Unable to reach the AI suggestion service." });
    }
  }

  if (!state.result && !state.loading && !state.error) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={fetchSuggestion} className="gap-1.5">
        <span className="material-symbols-outlined text-[16px]">auto_awesome</span>
        Get AI severity suggestion
      </Button>
    );
  }

  return (
    <div className="rounded-lg border border-tertiary/30 bg-tertiary-container/20 p-3 text-xs">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-tertiary uppercase">
        <span className="material-symbols-outlined text-[14px]">auto_awesome</span>
        AI suggestion — advisory only, not a decision
      </div>
      {state.loading && <p className="text-on-surface-variant">Asking the model…</p>}
      {state.error && <p className="text-error">{state.error}</p>}
      {state.result && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={state.result.suggestedSeverity} tone={state.result.suggestedSeverity === "S1" ? "critical" : "warning"} />
            <span className="text-on-surface-variant">{Math.round(state.result.confidence * 100)}% confidence</span>
            <span className="rounded-full bg-surface-container px-2 py-0.5 text-[10px] font-semibold text-on-surface-variant">
              {state.result.source === "structured-ml" ? "Structured model" : "Groq (fallback)"}
            </span>
          </div>
          {state.result.requiresHumanReview && (
            <p className="flex items-center gap-1 text-[11px] font-semibold text-error">
              <span className="material-symbols-outlined text-xs">flag</span>
              Flagged for human review — treat this suggestion with extra caution.
            </p>
          )}
          <p className="text-on-surface">{state.result.rationale}</p>
          {state.result.citedFactors.length > 0 && (
            <ul className="flex flex-wrap gap-1.5 pt-0.5">
              {state.result.citedFactors.map((f) => (
                <li key={f} className="rounded-full bg-surface-container-lowest px-2 py-0.5 text-[10px] text-on-surface-variant">{f}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
