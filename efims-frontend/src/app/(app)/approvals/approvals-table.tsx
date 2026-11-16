"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, ArrowRight } from "lucide-react";
import type { ApprovalRegisterRow, ApprovalStatus } from "@/features/workflow/types";
import { StatusBadge } from "@/components/shell/status-badge";
import { Badge } from "@/components/ui/badge";
import { Mono } from "@/components/ui/mono";
import { DetailDrawer } from "@/components/shell/detail-drawer";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const STATUS_TONE: Record<ApprovalStatus, "positive" | "warning" | "critical" | "neutral"> = {
  PENDING: "warning",
  APPROVED: "positive",
  REJECTED: "critical",
};

export function ApprovalsTable({ rows }: { rows: ApprovalRegisterRow[] }) {
  const [selected, setSelected] = useState<ApprovalRegisterRow | null>(null);

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow className="bg-surface-container-low">
            <TableHead>Case</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Severity band</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Requested</TableHead>
            <TableHead className="text-center">Open</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="py-8 text-center text-sm text-on-surface-variant">No approval requests match this filter.</TableCell>
            </TableRow>
          )}
          {rows.map((r) => (
            <TableRow key={r.id} className="cursor-pointer hover:bg-surface-container-low/60" onClick={() => setSelected(r)}>
              <TableCell>
                <div className="flex flex-col">
                  <Mono className="w-fit rounded bg-surface-container px-2 py-0.5 text-primary">{r.case.referenceCode}</Mono>
                  <span className="mt-1 text-sm font-semibold text-on-surface">{r.case.title}</span>
                </div>
              </TableCell>
              <TableCell><Badge variant="outline" className="border-outline-variant text-on-surface-variant">{r.action.replaceAll("_", " ")}</Badge></TableCell>
              <TableCell className="text-xs text-on-surface-variant">{r.severityBand.replace("_", "-")}</TableCell>
              <TableCell><StatusBadge status={r.status} tone={STATUS_TONE[r.status]} /></TableCell>
              <TableCell className="text-xs text-on-surface-variant">{new Date(r.requestedAt).toLocaleDateString()}</TableCell>
              <TableCell className="text-center">
                <Link
                  href={`/cases/${r.caseId}/approvals`}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex rounded-full p-1.5 text-primary transition-colors hover:bg-surface-container"
                  title="Open approval"
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
        title={selected?.case.title ?? ""}
        subtitle={selected?.case.referenceCode}
        footer={
          selected && (
            <Link
              href={`/cases/${selected.caseId}/approvals`}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-tertiary px-4 py-2 text-xs font-semibold text-on-tertiary transition-colors hover:bg-tertiary/90"
            >
              Open approval
              <ArrowRight size={16} strokeWidth={2} />
            </Link>
          )
        }
      >
        {selected && (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap gap-2">
              <StatusBadge status={selected.status} tone={STATUS_TONE[selected.status]} />
              <Badge variant="outline" className="border-outline-variant text-on-surface-variant">{selected.action.replaceAll("_", " ")}</Badge>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold tracking-wide text-on-surface-variant uppercase">Request notes</p>
              <p className="text-on-surface">{selected.requestNotes}</p>
            </div>
            {selected.decisionNotes && (
              <div>
                <p className="mb-1 text-[11px] font-semibold tracking-wide text-on-surface-variant uppercase">Decision notes</p>
                <p className="text-on-surface">{selected.decisionNotes}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="mb-1 text-[11px] font-semibold tracking-wide text-on-surface-variant uppercase">Requested</p>
                <Mono className="text-on-surface">{new Date(selected.requestedAt).toLocaleDateString()}</Mono>
              </div>
              {selected.decidedAt && (
                <div>
                  <p className="mb-1 text-[11px] font-semibold tracking-wide text-on-surface-variant uppercase">Decided</p>
                  <Mono className="text-on-surface">{new Date(selected.decidedAt).toLocaleDateString()}</Mono>
                </div>
              )}
            </div>
          </div>
        )}
      </DetailDrawer>
    </>
  );
}
