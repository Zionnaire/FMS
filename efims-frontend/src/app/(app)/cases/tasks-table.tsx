"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { MergedTaskRow } from "@/features/tasks/merge";
import { completeTaskAction, cancelTaskAction } from "@/features/tasks/actions";
import type { FormState } from "@/lib/form-state";
import { Mono } from "@/components/ui/mono";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/shell/submit-button";
import { DetailDrawer } from "@/components/shell/detail-drawer";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { isPastDeadline } from "@/lib/time";

const initialState: FormState = {};

const KIND_LABEL: Record<MergedTaskRow["kind"], string> = {
  task: "Task",
  capa: "Remediation",
  approval: "Approval",
  containment: "Containment",
};

function isOverdue(row: MergedTaskRow): boolean {
  return !!row.dueAt && isPastDeadline(row.dueAt);
}

/** `kind === "task"` rows get a real complete/cancel action — every other kind (CAPA,
 * approval, containment) is read-derived from its own module's register and always routes
 * "open" to the real case-detail tab, since a generic "mark done" button would bypass CD-04
 * approval gates / segregation of duties / confirmation-gating. See `mergeTaskRows`'s own doc
 * comment. */
function TaskActions({ row }: { row: MergedTaskRow }) {
  const completeAction = completeTaskAction.bind(null, row.caseId, row.sourceId);
  const cancelBound = cancelTaskAction.bind(null, row.caseId, row.sourceId);
  const [cancelState, cancelFormAction] = useActionState(cancelBound, initialState);
  const [showCancel, setShowCancel] = useState(false);

  if (row.kind !== "task" || row.status !== "OPEN") {
    return (
      <Link href={row.openHref} onClick={(e) => e.stopPropagation()} className="inline-flex rounded-full p-1.5 text-primary transition-colors hover:bg-surface-container" title="Open">
        <span className="material-symbols-outlined text-base">visibility</span>
      </Link>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-1">
        <form action={completeAction}>
          <SubmitButton size="sm">Complete</SubmitButton>
        </form>
        <button type="button" onClick={() => setShowCancel((v) => !v)} className="rounded-full px-2 py-1 text-[11px] font-semibold text-on-surface-variant hover:text-error">
          Cancel
        </button>
      </div>
      {showCancel && (
        <div className="space-y-1">
          <form action={cancelFormAction} className="flex items-center gap-1.5">
            <Input name="reason" placeholder="Reason" className="h-8 text-xs" required minLength={3} />
            <SubmitButton size="sm" variant="destructive">Confirm</SubmitButton>
          </form>
          {cancelState.error && <p className="text-[11px] font-medium text-error">{cancelState.error}</p>}
        </div>
      )}
    </div>
  );
}

export function TasksTable({ rows }: { rows: MergedTaskRow[] }) {
  const [selected, setSelected] = useState<MergedTaskRow | null>(null);

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow className="bg-surface-container-low">
            <TableHead>Task &amp; case</TableHead>
            <TableHead>Kind</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Due</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="py-8 text-center text-sm text-on-surface-variant">Nothing due across your accessible cases.</TableCell>
            </TableRow>
          )}
          {rows.map((row) => (
            <TableRow key={row.key} className="cursor-pointer hover:bg-surface-container-low/60" onClick={() => setSelected(row)}>
              <TableCell>
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-on-surface">{row.title}</span>
                  <div className="mt-1 flex items-center gap-1.5">
                    <Mono className="rounded bg-surface-container px-2 py-0.5 text-primary">{row.caseRef}</Mono>
                    <span className="text-[11px] text-on-surface-variant">{row.caseTitle}</span>
                  </div>
                </div>
              </TableCell>
              <TableCell className="text-xs text-on-surface-variant">{KIND_LABEL[row.kind]}</TableCell>
              <TableCell>
                <span className="inline-flex items-center gap-1 rounded-full bg-surface-container px-2.5 py-1 text-xs font-bold text-on-surface-variant">
                  {row.status.replaceAll("_", " ")}
                </span>
              </TableCell>
              <TableCell className={`text-xs ${isOverdue(row) ? "font-bold text-error" : "text-on-surface-variant"}`}>
                {row.dueAt ? new Date(row.dueAt).toLocaleDateString() : "—"}
              </TableCell>
              <TableCell className="text-right">
                <TaskActions row={row} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <DetailDrawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.title ?? ""}
        subtitle={selected?.caseRef}
        footer={
          selected && (
            <Link
              href={selected.openHref}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-container"
            >
              Open {KIND_LABEL[selected.kind].toLowerCase()}
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </Link>
          )
        }
      >
        {selected && (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-surface-container px-2.5 py-1 text-xs font-bold text-on-surface-variant">
                {selected.status.replaceAll("_", " ")}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary-container px-2.5 py-1 text-xs font-bold text-on-secondary-container">
                {KIND_LABEL[selected.kind]}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="mb-1 text-[11px] font-semibold tracking-wide text-on-surface-variant uppercase">Case</p>
                <p className="text-on-surface">{selected.caseTitle}</p>
              </div>
              {selected.dueAt && (
                <div>
                  <p className="mb-1 text-[11px] font-semibold tracking-wide text-on-surface-variant uppercase">Due</p>
                  <Mono className={isOverdue(selected) ? "text-error" : "text-on-surface"}>{new Date(selected.dueAt).toLocaleDateString()}</Mono>
                </div>
              )}
            </div>
          </div>
        )}
      </DetailDrawer>
    </>
  );
}
