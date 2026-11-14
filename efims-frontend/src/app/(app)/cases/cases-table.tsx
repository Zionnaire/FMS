"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { CaseListItem, CaseStatus, SeverityTier } from "@/features/cases/types";
import { bulkAssignCasesAction, bulkEscalateCasesAction } from "@/features/cases/actions";
import type { Team } from "@/features/teams/types";
import type { FormState } from "@/lib/form-state";
import { StatusBadge } from "@/components/shell/status-badge";
import { Badge } from "@/components/ui/badge";
import { Mono } from "@/components/ui/mono";
import { DetailDrawer } from "@/components/shell/detail-drawer";
import { SubmitButton } from "@/components/shell/submit-button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const STATUS_TONE: Record<CaseStatus, "positive" | "warning" | "critical" | "neutral"> = {
  OPEN: "warning",
  UNDER_INVESTIGATION: "warning",
  ON_HOLD: "neutral",
  CLOSED: "positive",
};

const SEVERITY_DOT: Record<SeverityTier, string> = {
  S1: "var(--color-severity-s1)",
  S2: "var(--color-severity-s2)",
  S3: "var(--color-severity-s3)",
  S4: "var(--color-severity-s4)",
};

const initialState: FormState = {};

function ErrorBanner({ state }: { state: FormState }) {
  if (!state.error) return null;
  return <p className="rounded-lg border border-error/30 bg-error-container/40 px-3 py-2 text-xs font-medium text-on-error-container">{state.error}</p>;
}

/** Bulk "Assign to team" panel — reuses `DetailDrawer`'s shell for a small form instead of a
 * quick-preview. Closes and clears the selection itself once a submit completes with no error;
 * a partial failure (some cases assigned, some not) keeps it open so the analyst can see which
 * ones failed and why, rather than hiding that behind a toast. */
function BulkAssignPanel({ caseIds, teams, open, onClose, onSuccess }: { caseIds: string[]; teams: Team[]; open: boolean; onClose: () => void; onSuccess: () => void }) {
  const action = bulkAssignCasesAction.bind(null, caseIds);
  const [state, formAction] = useActionState(action, initialState);
  const submittedRef = useRef(false);

  useEffect(() => {
    if (submittedRef.current && !state.error) {
      submittedRef.current = false;
      onSuccess();
    }
  }, [state, onSuccess]);

  return (
    <DetailDrawer open={open} onClose={onClose} title="Assign to team" subtitle={`${caseIds.length} case${caseIds.length === 1 ? "" : "s"} selected`}>
      <form
        action={formAction}
        onSubmit={() => { submittedRef.current = true; }}
        className="space-y-3"
      >
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-outline uppercase">Team</label>
          <select
            name="teamId"
            required
            className="w-full cursor-pointer rounded-full border border-outline-variant/30 bg-surface-container-low px-3.5 py-1.5 text-xs text-on-surface focus:ring-1 focus:ring-primary focus:outline-none"
          >
            <option value="">Select a team…</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        <ErrorBanner state={state} />
        <SubmitButton size="sm" pendingText="Assigning…">Assign {caseIds.length} case{caseIds.length === 1 ? "" : "s"}</SubmitButton>
      </form>
    </DetailDrawer>
  );
}

/** Bulk "Escalate" panel — moves the selected case(s) to `UNDER_INVESTIGATION` and notifies the
 * team lead (server-side); same close-on-success/stay-open-on-partial-failure behavior as the
 * assign panel above. */
function BulkEscalatePanel({ caseIds, open, onClose, onSuccess }: { caseIds: string[]; open: boolean; onClose: () => void; onSuccess: () => void }) {
  const action = bulkEscalateCasesAction.bind(null, caseIds);
  const [state, formAction] = useActionState(action, initialState);
  const submittedRef = useRef(false);

  useEffect(() => {
    if (submittedRef.current && !state.error) {
      submittedRef.current = false;
      onSuccess();
    }
  }, [state, onSuccess]);

  return (
    <DetailDrawer open={open} onClose={onClose} title="Escalate" subtitle={`${caseIds.length} case${caseIds.length === 1 ? "" : "s"} selected`}>
      <form
        action={formAction}
        onSubmit={() => { submittedRef.current = true; }}
        className="space-y-3"
      >
        <p className="text-xs text-on-surface-variant">
          Moves each selected case to <span className="font-semibold text-on-surface">Under investigation</span> and notifies its team lead.
          A case already under investigation is left as-is, not treated as a failure.
        </p>
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-outline uppercase">Reason</label>
          <textarea
            name="reason"
            required
            minLength={5}
            rows={3}
            placeholder="Why these cases need active attention now…"
            className="w-full rounded-lg border border-outline-variant/30 bg-surface-container-low px-3.5 py-2 text-xs text-on-surface placeholder:text-outline/70 focus:ring-1 focus:ring-primary focus:outline-none"
          />
        </div>
        <ErrorBanner state={state} />
        <SubmitButton size="sm" variant="destructive" pendingText="Escalating…">Escalate {caseIds.length} case{caseIds.length === 1 ? "" : "s"}</SubmitButton>
      </form>
    </DetailDrawer>
  );
}

/** Clicking a row (outside its checkbox) opens a quick-preview drawer (Vanguard Precision's "Case
 * Dossier Inspector" pattern) using data already in memory from this list — no extra fetch. "Open
 * full case" inside the drawer still goes to the real `/cases/[id]` route for the full 7-tab
 * dossier; this is a progressive enhancement for a faster glance, not a replacement for the full
 * page. Checkboxes drive a bulk-selection action bar (Assign to team / Escalate) — real backend
 * capabilities (`POST /cases/bulk-assign`/`bulk-escalate`), not a visual-only mockup of the
 * selection pattern. */
export function CasesTable({ cases, teams }: { cases: CaseListItem[]; teams: Team[] }) {
  const [selected, setSelected] = useState<CaseListItem | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [assignOpen, setAssignOpen] = useState(false);
  const [escalateOpen, setEscalateOpen] = useState(false);

  const allChecked = cases.length > 0 && checkedIds.size === cases.length;
  const someChecked = checkedIds.size > 0 && !allChecked;

  function toggleAll() {
    setCheckedIds(allChecked ? new Set() : new Set(cases.map((c) => c.id)));
  }
  function toggleOne(id: string) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function clearSelection() {
    setCheckedIds(new Set());
  }

  const checkedIdsArray = Array.from(checkedIds);

  return (
    <>
      {checkedIds.size > 0 && (
        <div className="flex items-center justify-between gap-3 border-b border-outline-variant/30 bg-secondary-container/20 px-4 py-2.5">
          <span className="text-xs font-semibold text-on-surface">{checkedIds.size} selected</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAssignOpen(true)}
              className="rounded-full bg-surface-container px-3 py-1.5 text-[11px] font-semibold text-on-surface-variant transition-colors hover:text-primary"
            >
              Assign to team
            </button>
            <button
              type="button"
              onClick={() => setEscalateOpen(true)}
              className="rounded-full bg-error-container px-3 py-1.5 text-[11px] font-semibold text-on-error-container transition-colors hover:opacity-80"
            >
              Escalate
            </button>
            <button type="button" onClick={clearSelection} className="rounded-full p-1.5 text-on-surface-variant hover:text-on-surface" title="Clear selection">
              <span className="material-symbols-outlined text-base">close</span>
            </button>
          </div>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow className="bg-surface-container-low">
            <TableHead className="w-10">
              <input
                type="checkbox"
                checked={allChecked}
                ref={(el) => { if (el) el.indeterminate = someChecked; }}
                onChange={toggleAll}
                aria-label="Select all cases on this page"
                className="h-3.5 w-3.5 cursor-pointer rounded border-outline-variant accent-primary"
              />
            </TableHead>
            <TableHead>Case ID &amp; title</TableHead>
            <TableHead>Severity</TableHead>
            <TableHead>Compartment</TableHead>
            <TableHead>Sensitivity</TableHead>
            <TableHead>Linked incidents</TableHead>
            <TableHead>Team</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-center">Open</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {cases.length === 0 && (
            <TableRow>
              <TableCell colSpan={9} className="py-8 text-center text-xs text-on-surface-variant">No cases match this filter.</TableCell>
            </TableRow>
          )}
          {cases.map((c) => (
            <TableRow key={c.id} className="cursor-pointer hover:bg-surface-container-low/60" onClick={() => setSelected(c)}>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={checkedIds.has(c.id)}
                  onChange={() => toggleOne(c.id)}
                  aria-label={`Select ${c.referenceCode}`}
                  className="h-3.5 w-3.5 cursor-pointer rounded border-outline-variant accent-primary"
                />
              </TableCell>
              <TableCell>
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <Mono className="rounded bg-surface-container px-2 py-0.5 text-xs text-primary">{c.referenceCode}</Mono>
                    {c.isOverdue && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-error-container px-2 py-0.5 text-[10px] font-bold text-on-error-container">
                        Overdue
                      </span>
                    )}
                  </div>
                  <span className="mt-1 text-xs font-semibold text-on-surface">{c.title}</span>
                </div>
              </TableCell>
              <TableCell>
                {c.effectiveSeverity ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-container px-2 py-0.5 text-[11px] font-bold text-on-surface">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: SEVERITY_DOT[c.effectiveSeverity] }} />
                    {c.effectiveSeverity}
                  </span>
                ) : (
                  <span className="text-[11px] text-on-surface-variant">—</span>
                )}
              </TableCell>
              <TableCell><Badge variant="outline" className="border-outline-variant text-[11px] text-on-surface-variant">{c.compartment}</Badge></TableCell>
              <TableCell>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${c.sensitivityLevel === 4 ? "bg-error-container text-on-error-container" : "bg-surface-container text-on-surface-variant"}`}>
                  <span className="material-symbols-outlined text-xs">shield</span>
                  Tier {c.sensitivityLevel}
                </span>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-primary">
                  <span className="material-symbols-outlined text-xs">link</span>
                  {c.linkedIncidentsCount} linked
                </div>
              </TableCell>
              <TableCell className="text-[11px] text-on-surface-variant">{c.assignedTeamName ?? "Unassigned"}</TableCell>
              <TableCell><StatusBadge status={c.status} tone={STATUS_TONE[c.status]} /></TableCell>
              <TableCell className="text-center">
                <Link
                  href={`/cases/${c.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex rounded-full p-1.5 text-primary transition-colors hover:bg-surface-container"
                  title="Open case"
                >
                  <span className="material-symbols-outlined text-base">visibility</span>
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <BulkAssignPanel
        caseIds={checkedIdsArray}
        teams={teams}
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        onSuccess={() => { setAssignOpen(false); clearSelection(); }}
      />
      <BulkEscalatePanel
        caseIds={checkedIdsArray}
        open={escalateOpen}
        onClose={() => setEscalateOpen(false)}
        onSuccess={() => { setEscalateOpen(false); clearSelection(); }}
      />

      <DetailDrawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.title ?? ""}
        subtitle={selected?.referenceCode}
        footer={
          selected && (
            <Link
              href={`/cases/${selected.id}`}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-container"
            >
              Open full case
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </Link>
          )
        }
      >
        {selected && (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap gap-2">
              <StatusBadge status={selected.status} tone={STATUS_TONE[selected.status]} />
              <Badge variant="outline" className="border-outline-variant text-on-surface-variant">{selected.compartment}</Badge>
              <span className="inline-flex items-center gap-1 rounded-full bg-surface-container px-2.5 py-1 text-xs font-bold text-on-surface-variant">
                <span className="material-symbols-outlined text-sm">shield</span>
                Tier {selected.sensitivityLevel}
              </span>
              {selected.effectiveSeverity && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-container px-2.5 py-1 text-xs font-bold text-on-surface">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: SEVERITY_DOT[selected.effectiveSeverity] }} />
                  {selected.effectiveSeverity}
                </span>
              )}
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold tracking-wide text-on-surface-variant uppercase">Description</p>
              <p className="text-on-surface">{selected.description}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="mb-1 text-[11px] font-semibold tracking-wide text-on-surface-variant uppercase">Team</p>
                <p className="text-on-surface">{selected.assignedTeamName ?? "Unassigned"}</p>
              </div>
              <div>
                <p className="mb-1 text-[11px] font-semibold tracking-wide text-on-surface-variant uppercase">Linked incidents</p>
                <p className="text-on-surface">{selected.linkedIncidentsCount}</p>
              </div>
              <div>
                <p className="mb-1 text-[11px] font-semibold tracking-wide text-on-surface-variant uppercase">Opened</p>
                <Mono className="text-on-surface">{new Date(selected.createdAt).toLocaleDateString()}</Mono>
              </div>
              {selected.closedAt && (
                <div>
                  <p className="mb-1 text-[11px] font-semibold tracking-wide text-on-surface-variant uppercase">Closed</p>
                  <Mono className="text-on-surface">{new Date(selected.closedAt).toLocaleDateString()}</Mono>
                </div>
              )}
            </div>
          </div>
        )}
      </DetailDrawer>
    </>
  );
}
