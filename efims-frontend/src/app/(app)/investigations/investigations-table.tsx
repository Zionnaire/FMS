"use client";

import { useState } from "react";
import Link from "next/link";
import type { InvestigationPlanStatus, InvestigationRegisterRow } from "@/features/investigations/types";
import { StatusBadge } from "@/components/shell/status-badge";
import { Mono } from "@/components/ui/mono";
import { DetailDrawer } from "@/components/shell/detail-drawer";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const STATUS_TONE: Record<InvestigationPlanStatus, "positive" | "warning" | "critical" | "neutral"> = {
  DRAFT: "neutral",
  ACTIVE: "warning",
  COMPLETED: "positive",
};

export function InvestigationsTable({ rows }: { rows: InvestigationRegisterRow[] }) {
  const [selected, setSelected] = useState<InvestigationRegisterRow | null>(null);

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow className="bg-surface-container-low">
            <TableHead>Case</TableHead>
            <TableHead>Plan status</TableHead>
            <TableHead>Objectives</TableHead>
            <TableHead className="text-center">Open issues</TableHead>
            <TableHead>Last activity</TableHead>
            <TableHead className="text-center">Open</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="py-8 text-center text-sm text-on-surface-variant">No investigations match this filter.</TableCell>
            </TableRow>
          )}
          {rows.map((r) => (
            <TableRow key={r.caseId} className="cursor-pointer hover:bg-surface-container-low/60" onClick={() => setSelected(r)}>
              <TableCell>
                <div className="flex flex-col">
                  <Mono className="w-fit rounded bg-surface-container px-2 py-0.5 text-primary">{r.referenceCode}</Mono>
                  <span className="mt-1 text-sm font-semibold text-on-surface">{r.caseTitle}</span>
                </div>
              </TableCell>
              <TableCell><StatusBadge status={r.planStatus} tone={STATUS_TONE[r.planStatus]} /></TableCell>
              <TableCell className="max-w-xs truncate text-xs text-on-surface-variant">{r.objectives}</TableCell>
              <TableCell className="text-center">
                <span className={`inline-flex items-center justify-center rounded-full px-2.5 py-1 text-xs font-bold ${r.openIssueCount > 0 ? "bg-error-container text-on-error-container" : "bg-surface-container text-on-surface-variant"}`}>
                  {r.openIssueCount}
                </span>
              </TableCell>
              <TableCell className="text-xs text-on-surface-variant">{new Date(r.lastActivityAt).toLocaleDateString()}</TableCell>
              <TableCell className="text-center">
                <Link
                  href={`/cases/${r.caseId}/investigations`}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex rounded-full p-1.5 text-primary transition-colors hover:bg-surface-container"
                  title="Open investigation"
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
        title={selected?.caseTitle ?? ""}
        subtitle={selected?.referenceCode}
        footer={
          selected && (
            <Link
              href={`/cases/${selected.caseId}/investigations`}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-container"
            >
              Open investigation
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </Link>
          )
        }
      >
        {selected && (
          <div className="space-y-4 text-sm">
            <StatusBadge status={selected.planStatus} tone={STATUS_TONE[selected.planStatus]} />
            <div>
              <p className="mb-1 text-[11px] font-semibold tracking-wide text-on-surface-variant uppercase">Objectives</p>
              <p className="text-on-surface">{selected.objectives}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="mb-1 text-[11px] font-semibold tracking-wide text-on-surface-variant uppercase">Open issues</p>
                <p className="text-on-surface">{selected.openIssueCount}</p>
              </div>
              <div>
                <p className="mb-1 text-[11px] font-semibold tracking-wide text-on-surface-variant uppercase">Last activity</p>
                <Mono className="text-on-surface">{new Date(selected.lastActivityAt).toLocaleDateString()}</Mono>
              </div>
            </div>
          </div>
        )}
      </DetailDrawer>
    </>
  );
}
