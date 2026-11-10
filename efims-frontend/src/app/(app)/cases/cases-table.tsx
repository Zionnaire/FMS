"use client";

import { useState } from "react";
import Link from "next/link";
import type { CaseListItem, CaseStatus } from "@/features/cases/types";
import { StatusBadge } from "@/components/shell/status-badge";
import { Badge } from "@/components/ui/badge";
import { Mono } from "@/components/ui/mono";
import { DetailDrawer } from "@/components/shell/detail-drawer";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const STATUS_TONE: Record<CaseStatus, "positive" | "warning" | "critical" | "neutral"> = {
  OPEN: "warning",
  UNDER_INVESTIGATION: "warning",
  ON_HOLD: "neutral",
  CLOSED: "positive",
};

/** Clicking a row opens a quick-preview drawer (Vanguard Precision's "Case Dossier Inspector"
 * pattern) using data already in memory from this list — no extra fetch. "Open full case" inside
 * the drawer still goes to the real `/cases/[id]` route for the full 7-tab dossier; this is a
 * progressive enhancement for a faster glance, not a replacement for the full page. */
export function CasesTable({ cases }: { cases: CaseListItem[] }) {
  const [selected, setSelected] = useState<CaseListItem | null>(null);

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow className="bg-surface-container-low">
            <TableHead>Case ID &amp; title</TableHead>
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
              <TableCell colSpan={7} className="py-8 text-center text-sm text-on-surface-variant">No cases match this filter.</TableCell>
            </TableRow>
          )}
          {cases.map((c) => (
            <TableRow key={c.id} className="cursor-pointer hover:bg-surface-container-low/60" onClick={() => setSelected(c)}>
              <TableCell>
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <Mono className="rounded bg-surface-container px-2 py-0.5 text-primary">{c.referenceCode}</Mono>
                  </div>
                  <span className="mt-1 text-sm font-semibold text-on-surface">{c.title}</span>
                </div>
              </TableCell>
              <TableCell><Badge variant="outline" className="border-outline-variant text-on-surface-variant">{c.compartment}</Badge></TableCell>
              <TableCell>
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${c.sensitivityLevel === 4 ? "bg-error-container text-on-error-container" : "bg-surface-container text-on-surface-variant"}`}>
                  <span className="material-symbols-outlined text-sm">shield</span>
                  Tier {c.sensitivityLevel}
                </span>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                  <span className="material-symbols-outlined text-sm">link</span>
                  {c.linkedIncidentsCount} linked
                </div>
              </TableCell>
              <TableCell className="text-xs text-on-surface-variant">{c.assignedTeamName ?? "Unassigned"}</TableCell>
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
