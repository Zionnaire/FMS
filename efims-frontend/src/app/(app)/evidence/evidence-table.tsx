"use client";

import { useState } from "react";
import Link from "next/link";
import type { EvidenceRegisterRow } from "@/features/evidence/types";
import { Badge } from "@/components/ui/badge";
import { Mono } from "@/components/ui/mono";
import { DetailDrawer } from "@/components/shell/detail-drawer";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function EvidenceTable({ items }: { items: EvidenceRegisterRow[] }) {
  const [selected, setSelected] = useState<EvidenceRegisterRow | null>(null);
  const isVerified = (i: EvidenceRegisterRow) => i.custodyEvents?.some((e) => e.action === "HASH_VERIFIED") ?? false;

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow className="bg-surface-container-low">
            <TableHead>Item &amp; case</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Chain of custody</TableHead>
            <TableHead>Legal hold</TableHead>
            <TableHead>Collected</TableHead>
            <TableHead className="text-center">Open</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="py-8 text-center text-sm text-on-surface-variant">No evidence items match this filter.</TableCell>
            </TableRow>
          )}
          {items.map((item) => (
            <TableRow key={item.id} className="cursor-pointer hover:bg-surface-container-low/60" onClick={() => setSelected(item)}>
              <TableCell>
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-on-surface">{item.title}</span>
                  <div className="mt-1 flex items-center gap-1.5">
                    <Mono className="rounded bg-surface-container px-2 py-0.5 text-primary">{item.case.referenceCode}</Mono>
                    <span className="text-[11px] text-on-surface-variant">{item.case.title}</span>
                  </div>
                </div>
              </TableCell>
              <TableCell><Badge variant="outline" className="border-outline-variant text-on-surface-variant">{item.category.replaceAll("_", " ")}</Badge></TableCell>
              <TableCell className="text-xs text-on-surface-variant">{item.sourceSystem ?? "—"}</TableCell>
              <TableCell>
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${isVerified(item) ? "bg-tertiary-fixed text-on-tertiary-fixed-variant" : "bg-surface-container text-on-surface-variant"}`}>
                  <span className="material-symbols-outlined text-sm">{isVerified(item) ? "verified" : "schedule"}</span>
                  {isVerified(item) ? "Verified" : "Unverified"}
                </span>
              </TableCell>
              <TableCell>
                {item.legalHold ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-error-container px-2.5 py-1 text-xs font-bold text-on-error-container">
                    <span className="material-symbols-outlined text-sm">gavel</span> Held
                  </span>
                ) : (
                  <span className="text-xs text-on-surface-variant">—</span>
                )}
              </TableCell>
              <TableCell className="text-xs text-on-surface-variant">{new Date(item.collectedAt).toLocaleDateString()}</TableCell>
              <TableCell className="text-center">
                <Link
                  href={`/cases/${item.caseId}/evidence`}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex rounded-full p-1.5 text-primary transition-colors hover:bg-surface-container"
                  title="Open evidence"
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
        subtitle={selected?.case.referenceCode}
        footer={
          selected && (
            <Link
              href={`/cases/${selected.caseId}/evidence`}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-container"
            >
              Open evidence
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </Link>
          )
        }
      >
        {selected && (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="border-outline-variant text-on-surface-variant">{selected.category.replaceAll("_", " ")}</Badge>
              {selected.legalHold && (
                <span className="inline-flex items-center gap-1 rounded-full bg-error-container px-2.5 py-1 text-xs font-bold text-on-error-container">
                  <span className="material-symbols-outlined text-sm">gavel</span> Legal hold
                </span>
              )}
            </div>
            {selected.description && (
              <div>
                <p className="mb-1 text-[11px] font-semibold tracking-wide text-on-surface-variant uppercase">Description</p>
                <p className="text-on-surface">{selected.description}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="mb-1 text-[11px] font-semibold tracking-wide text-on-surface-variant uppercase">Content hash</p>
                <Mono className="break-all text-on-surface">{selected.contentHash}</Mono>
              </div>
              <div>
                <p className="mb-1 text-[11px] font-semibold tracking-wide text-on-surface-variant uppercase">Collected</p>
                <Mono className="text-on-surface">{new Date(selected.collectedAt).toLocaleDateString()}</Mono>
              </div>
              {selected.legalHoldReason && (
                <div className="col-span-2">
                  <p className="mb-1 text-[11px] font-semibold tracking-wide text-on-surface-variant uppercase">Legal hold reason</p>
                  <p className="text-on-surface">{selected.legalHoldReason}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </DetailDrawer>
    </>
  );
}
