"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, ArrowRight } from "lucide-react";
import type { CapaActionStatus, CapaRegisterRow } from "@/features/capa/types";
import { StatusBadge } from "@/components/shell/status-badge";
import { Badge } from "@/components/ui/badge";
import { Mono } from "@/components/ui/mono";
import { DetailDrawer } from "@/components/shell/detail-drawer";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { isPastDeadline } from "@/lib/time";

const STATUS_TONE: Record<CapaActionStatus, "positive" | "warning" | "critical" | "neutral"> = {
  OPEN: "neutral",
  IN_PROGRESS: "warning",
  COMPLETED: "positive",
  VALIDATED: "positive",
  CANCELLED: "critical",
};

export function RemediationTable({ rows }: { rows: CapaRegisterRow[] }) {
  const [selected, setSelected] = useState<CapaRegisterRow | null>(null);
  const isOverdue = (r: CapaRegisterRow) => (r.status === "OPEN" || r.status === "IN_PROGRESS") && isPastDeadline(r.dueDate);

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow className="bg-surface-container-low">
            <TableHead>Action &amp; case</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Due date</TableHead>
            <TableHead className="text-center">Open</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="py-8 text-center text-sm text-on-surface-variant">No CAPA actions match this filter.</TableCell>
            </TableRow>
          )}
          {rows.map((r) => (
            <TableRow key={r.id} className="cursor-pointer hover:bg-surface-container-low/60" onClick={() => setSelected(r)}>
              <TableCell>
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-on-surface">{r.title}</span>
                  <div className="mt-1 flex items-center gap-1.5">
                    <Mono className="rounded bg-surface-container px-2 py-0.5 text-primary">{r.case.referenceCode}</Mono>
                    <span className="text-[11px] text-on-surface-variant">{r.case.title}</span>
                  </div>
                </div>
              </TableCell>
              <TableCell><Badge variant="outline" className="border-outline-variant text-on-surface-variant">{r.type}</Badge></TableCell>
              <TableCell><StatusBadge status={r.status} tone={STATUS_TONE[r.status]} /></TableCell>
              <TableCell className={`text-xs ${isOverdue(r) ? "font-bold text-error" : "text-on-surface-variant"}`}>
                {new Date(r.dueDate).toLocaleDateString()} {isOverdue(r) && "(overdue)"}
              </TableCell>
              <TableCell className="text-center">
                <Link
                  href={`/cases/${r.caseId}/capa`}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex rounded-full p-1.5 text-primary transition-colors hover:bg-surface-container"
                  title="Open remediation action"
                >
                  <Eye size={16} strokeWidth={2} />
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <DetailDrawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.title ?? ""}
        subtitle={selected?.case.referenceCode}
        footer={
          selected && (
            <Link
              href={`/cases/${selected.caseId}/capa`}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-tertiary px-4 py-2 text-xs font-semibold text-on-tertiary transition-colors hover:bg-tertiary/90"
            >
              Open remediation action
              <ArrowRight size={16} strokeWidth={2} />
            </Link>
          )
        }
      >
        {selected && (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap gap-2">
              <StatusBadge status={selected.status} tone={STATUS_TONE[selected.status]} />
              <Badge variant="outline" className="border-outline-variant text-on-surface-variant">{selected.type}</Badge>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold tracking-wide text-on-surface-variant uppercase">Description</p>
              <p className="text-on-surface">{selected.description}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="mb-1 text-[11px] font-semibold tracking-wide text-on-surface-variant uppercase">Due</p>
                <Mono className="text-on-surface">{new Date(selected.dueDate).toLocaleDateString()}</Mono>
              </div>
              {selected.completionNotes && (
                <div>
                  <p className="mb-1 text-[11px] font-semibold tracking-wide text-on-surface-variant uppercase">Completion notes</p>
                  <p className="text-on-surface">{selected.completionNotes}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </DetailDrawer>
    </>
  );
}
