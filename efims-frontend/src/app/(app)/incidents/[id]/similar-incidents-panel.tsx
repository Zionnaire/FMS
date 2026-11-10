"use client";

import { useState } from "react";
import { relateIncidentsAction, mergeIncidentAction } from "@/features/incidents/actions";
import type { SimilarIncidentResult } from "@/features/incidents/api";
import { Button } from "@/components/ui/button";

/** CD-08 Phase 2 advisory duplicate/correlation detection. Only ever finds and scores
 * candidates — Relate/Merge here call the exact same, already-existing, already-tested
 * `relateIncidentsAction`/`mergeIncidentAction` Server Actions the manual UUID-entry form below
 * this panel uses; this is a faster way to reach those actions, not a new write path. */
export function SimilarIncidentsPanel({ incidentId }: { incidentId: string }) {
  const [state, setState] = useState<{ loading: boolean; results: SimilarIncidentResult[] | null; error: string | null }>({
    loading: false,
    results: null,
    error: null,
  });
  const [acting, setActing] = useState<string | null>(null);

  async function fetchSimilar() {
    setState({ loading: true, results: null, error: null });
    try {
      const res = await fetch(`/api/incidents/${incidentId}/similar`);
      const data = await res.json();
      if (!res.ok) {
        setState({ loading: false, results: null, error: data.error ?? "Unable to check for similar incidents right now." });
        return;
      }
      setState({ loading: false, results: data.results, error: null });
    } catch {
      setState({ loading: false, results: null, error: "Unable to reach the AI similarity service." });
    }
  }

  async function act(kind: "relate" | "merge", candidateId: string) {
    setActing(candidateId);
    const fd = new FormData();
    fd.set(kind === "relate" ? "relatedIncidentId" : "targetIncidentId", candidateId);
    try {
      if (kind === "relate") await relateIncidentsAction(incidentId, fd);
      else await mergeIncidentAction(incidentId, fd);
    } finally {
      // Re-fetch rather than locally filter: the Server Action's own `revalidatePath` can race
      // with a local state update on this client component, leaving it stuck mid-action even
      // though the write already succeeded. A fresh fetch is the authoritative source of truth
      // and self-corrects regardless of that race.
      setActing(null);
      await fetchSimilar();
    }
  }

  if (!state.results && !state.loading && !state.error) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={fetchSimilar} className="gap-1.5">
        <span className="material-symbols-outlined text-[16px]">auto_awesome</span>
        Find possibly-related incidents
      </Button>
    );
  }

  return (
    <div className="rounded-lg border border-tertiary/30 bg-tertiary-container/20 p-3 text-xs">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-tertiary uppercase">
        <span className="material-symbols-outlined text-[14px]">auto_awesome</span>
        AI similarity — advisory only, you decide whether to relate or merge
      </div>
      {state.loading && <p className="text-on-surface-variant">Scanning open incidents…</p>}
      {state.error && <p className="text-error">{state.error}</p>}
      {state.results && state.results.length === 0 && <p className="text-on-surface-variant">No similar incidents found.</p>}
      {state.results && state.results.length > 0 && (
        <ul className="space-y-2">
          {state.results.map((r) => (
            <li key={r.incidentId} className="rounded-md bg-surface-container-lowest p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] text-on-surface-variant">{r.incidentId.slice(0, 8)}</span>
                <span className="font-semibold text-tertiary">{Math.round(r.score * 100)}% match</span>
              </div>
              {r.citedFactors.length > 0 && (
                <ul className="mt-1 flex flex-wrap gap-1.5">
                  {r.citedFactors.map((f) => (
                    <li key={f} className="rounded-full bg-surface-container-low px-2 py-0.5 text-[10px] text-on-surface-variant">{f}</li>
                  ))}
                </ul>
              )}
              <div className="mt-2 flex gap-2">
                <Button type="button" size="sm" variant="outline" disabled={acting === r.incidentId} onClick={() => act("relate", r.incidentId)}>
                  Relate
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={acting === r.incidentId} onClick={() => act("merge", r.incidentId)}>
                  Merge into this
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
