"use client";

import { useState } from "react";
import { Check, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** The EFIMS AI Service's own v1.0 integration spec, rule #3: "record whether the analyst
 * accepted or overrode it." Shared by every advisory panel that shows a structured-model
 * prediction (severity/anomaly/recovery) — only ever rendered when a real `predictionId` exists
 * (a Groq-fallback severity suggestion's is `null` and was never logged backend-side, so there's
 * nothing to decide). Purely a record of what the analyst did; it never changes anything else in
 * EFIMS — the human's own choice elsewhere (the assess form, recording a loss/recovery, etc.) is
 * still what counts. */
export function PredictionDecisionControls({ predictionId }: { predictionId: string }) {
  const [state, setState] = useState<{ pending: boolean; recorded: "ACCEPTED" | "OVERRIDDEN" | null; error: string | null }>({
    pending: false,
    recorded: null,
    error: null,
  });

  async function record(decision: "ACCEPTED" | "OVERRIDDEN") {
    setState({ pending: true, recorded: null, error: null });
    try {
      const res = await fetch(`/api/ml-gateway/predictions/${predictionId}/decision`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setState({ pending: false, recorded: null, error: data?.error ?? "Unable to record your decision right now." });
        return;
      }
      setState({ pending: false, recorded: decision, error: null });
    } catch {
      setState({ pending: false, recorded: null, error: "Unable to reach the server to record your decision." });
    }
  }

  if (state.recorded) {
    return (
      <span className="flex items-center gap-1 text-[11px] font-semibold text-on-surface-variant">
        <Check size={12} strokeWidth={2.5} />
        Recorded as {state.recorded === "ACCEPTED" ? "accepted" : "overridden"}
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-tertiary/20 pt-2">
      <span className="text-[11px] text-on-surface-variant">Did you go with this suggestion?</span>
      <Button type="button" variant="outline" size="sm" disabled={state.pending} onClick={() => record("ACCEPTED")} className="h-6 gap-1 px-2 text-[11px]">
        <Check size={12} strokeWidth={2} />
        Accepted
      </Button>
      <Button type="button" variant="outline" size="sm" disabled={state.pending} onClick={() => record("OVERRIDDEN")} className="h-6 gap-1 px-2 text-[11px]">
        <Undo2 size={12} strokeWidth={2} />
        Went a different way
      </Button>
      {state.error && <span className="text-[11px] text-error">{state.error}</span>}
    </div>
  );
}
