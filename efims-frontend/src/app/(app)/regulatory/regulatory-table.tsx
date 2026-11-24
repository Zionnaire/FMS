"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, ArrowRight } from "lucide-react";
import type { ObligationStatus, RegulatoryRegisterRow } from "@/features/regulatory/types";
import { StatusBadge } from "@/components/shell/status-badge";
import { Badge } from "@/components/ui/badge";
import { Mono } from "@/components/ui/mono";
import { ClientDate } from "@/components/shell/client-date";
import { DetailDrawer } from "@/components/shell/detail-drawer";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { isPastDeadline } from "@/lib/time";

const STATUS_TONE: Record<ObligationStatus, "positive" | "warning" | "critical" | "neutral"> = {
  PENDING: "warning",
  SUBMITTED: "neutral",
  ACKNOWLEDGED: "positive",
  WAIVED: "critical",
};

export function RegulatoryTable({ rows }: { rows: RegulatoryRegisterRow[] }) {
  const [selected, setSelected] = useState<RegulatoryRegisterRow | null>(null);
  const isOverdue = (r: RegulatoryRegisterRow) => r.status === "PENDING" && isPastDeadline(r.deadline);

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow className="bg-surface-container-low">
            <TableHead>Case</TableHead>
            <TableHead>Obligation type</TableHead>
            <TableHead>Regulator</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Deadline</TableHead>
            <TableHead className="text-center">Open</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="py-8 text-center text-sm text-on-surface-variant">No regulatory obligations match this filter.</TableCell>
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
              <TableCell><Badge variant="outline" className="border-outline-variant text-on-surface-variant">{r.obligationType.replaceAll("_", "/")}</Badge></TableCell>
              <TableCell className="text-xs text-on-surface-variant">{r.regulatorName ?? "—"}</TableCell>
              <TableCell><StatusBadge status={r.status} tone={STATUS_TONE[r.status]} /></TableCell>
              <TableCell className={`text-xs ${isOverdue(r) ? "font-bold text-error" : "text-on-surface-variant"}`}>
                <ClientDate value={r.deadline} /> {isOverdue(r) && "(overdue)"}
              </TableCell>
              <TableCell className="text-center">
                <Link
                  href={`/cases/${r.caseId}/regulatory`}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex rounded-full p-1.5 text-primary transition-colors hover:bg-surface-container"
                  title="Open obligation"
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
              href={`/cases/${selected.caseId}/regulatory`}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-tertiary px-4 py-2 text-xs font-semibold text-on-tertiary transition-colors hover:bg-tertiary/90"
            >
              Open obligation
              <ArrowRight size={16} strokeWidth={2} />
            </Link>
          )
        }
      >
        {selected && (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap gap-2">
              <StatusBadge status={selected.status} tone={STATUS_TONE[selected.status]} />
              <Badge variant="outline" className="border-outline-variant text-on-surface-variant">{selected.obligationType.replaceAll("_", "/")}</Badge>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold tracking-wide text-on-surface-variant uppercase">Description</p>
              <p className="text-on-surface">{selected.description}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="mb-1 text-[11px] font-semibold tracking-wide text-on-surface-variant uppercase">Deadline</p>
                <Mono className="text-on-surface"><ClientDate value={selected.deadline} /></Mono>
              </div>
              {selected.regulatorName && (
                <div>
                  <p className="mb-1 text-[11px] font-semibold tracking-wide text-on-surface-variant uppercase">Regulator</p>
                  <p className="text-on-surface">{selected.regulatorName}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </DetailDrawer>
    </>
  );
}
