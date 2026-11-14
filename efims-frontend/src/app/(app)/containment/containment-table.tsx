"use client";

import { useState } from "react";
import Link from "next/link";
import type { ContainmentRegisterRow, ContainmentStatus } from "@/features/containment/types";
import { StatusBadge } from "@/components/shell/status-badge";
import { Badge } from "@/components/ui/badge";
import { Mono } from "@/components/ui/mono";
import { DetailDrawer } from "@/components/shell/detail-drawer";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const STATUS_TONE: Record<ContainmentStatus, "positive" | "warning" | "critical" | "neutral"> = {
  REQUESTED: "warning",
  CONFIRMED: "positive",
  REJECTED: "critical",
  CANCELLED: "neutral",
};

export function ContainmentTable({ rows }: { rows: ContainmentRegisterRow[] }) {
  const [selected, setSelected] = useState<ContainmentRegisterRow | null>(null);

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow className="bg-surface-container-low">
            <TableHead>Case</TableHead>
            <TableHead>Action type</TableHead>
            <TableHead>Target</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Requested</TableHead>
            <TableHead className="text-center">Open</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="py-8 text-center text-sm text-on-surface-variant">No containment requests match this filter.</TableCell>
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
              <TableCell><Badge variant="outline" className="border-outline-variant text-on-surface-variant">{r.actionType.replaceAll("_", " ")}</Badge></TableCell>
              <TableCell className="max-w-xs truncate text-xs text-on-surface-variant">{r.targetDescription}</TableCell>
              <TableCell><StatusBadge status={r.status} tone={STATUS_TONE[r.status]} /></TableCell>
              <TableCell className="text-xs text-on-surface-variant">{new Date(r.requestedAt).toLocaleDateString()}</TableCell>
              <TableCell className="text-center">
                <Link
                  href={`/cases/${r.caseId}/containment`}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex rounded-full p-1.5 text-primary transition-colors hover:bg-surface-container"
                  title="Open containment request"
                >
                  <span className="material-symbols-outlined text-base">visibility</span>
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
              href={`/cases/${selected.caseId}/containment`}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-container"
            >
              Open containment request
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </Link>
          )
        }
      >
        {selected && (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap gap-2">
              <StatusBadge status={selected.status} tone={STATUS_TONE[selected.status]} />
              <Badge variant="outline" className="border-outline-variant text-on-surface-variant">{selected.actionType.replaceAll("_", " ")}</Badge>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold tracking-wide text-on-surface-variant uppercase">Target</p>
              <p className="text-on-surface">{selected.targetDescription}</p>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold tracking-wide text-on-surface-variant uppercase">Rationale</p>
              <p className="text-on-surface">{selected.rationale}</p>
            </div>
            {selected.confirmationRef && (
              <div>
                <p className="mb-1 text-[11px] font-semibold tracking-wide text-on-surface-variant uppercase">Confirmation reference</p>
                <Mono className="text-on-surface">{selected.confirmationRef}</Mono>
              </div>
            )}
            {selected.rejectionReason && (
              <div>
                <p className="mb-1 text-[11px] font-semibold tracking-wide text-on-surface-variant uppercase">Rejection reason</p>
                <p className="text-on-surface">{selected.rejectionReason}</p>
              </div>
            )}
          </div>
        )}
      </DetailDrawer>
    </>
  );
}
