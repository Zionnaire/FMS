"use client";

import { useState } from "react";
import Link from "next/link";
import type { RecoveryRegisterRow } from "@/features/recovery/types";
import { Mono } from "@/components/ui/mono";
import { DetailDrawer } from "@/components/shell/detail-drawer";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function formatNgn(amount: string): string {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(Number(amount));
}

export function RecoveryTable({ rows }: { rows: RecoveryRegisterRow[] }) {
  const [selected, setSelected] = useState<RecoveryRegisterRow | null>(null);

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow className="bg-surface-container-low">
            <TableHead>Case</TableHead>
            <TableHead>Loss</TableHead>
            <TableHead>Recovered</TableHead>
            <TableHead>Written off</TableHead>
            <TableHead>Outstanding</TableHead>
            <TableHead className="text-center">Open</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="py-8 text-center text-sm text-on-surface-variant">No cases match this filter.</TableCell>
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
              <TableCell className="text-xs text-on-surface-variant">{formatNgn(r.totalLoss)}</TableCell>
              <TableCell className="text-xs text-tertiary">{formatNgn(r.totalRecovered)}</TableCell>
              <TableCell className="text-xs text-on-surface-variant">{formatNgn(r.totalWrittenOff)}</TableCell>
              <TableCell>
                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ${Number(r.outstanding) > 0 ? "bg-error-container text-on-error-container" : "bg-tertiary-fixed text-on-tertiary-fixed-variant"}`}>
                  {formatNgn(r.outstanding)}
                </span>
              </TableCell>
              <TableCell className="text-center">
                <Link
                  href={`/cases/${r.caseId}/recovery`}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex rounded-full p-1.5 text-primary transition-colors hover:bg-surface-container"
                  title="Open recovery ledger"
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
              href={`/cases/${selected.caseId}/recovery`}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-container"
            >
              Open recovery ledger
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </Link>
          )
        }
      >
        {selected && (
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="mb-1 text-[11px] font-semibold tracking-wide text-on-surface-variant uppercase">Total loss</p>
              <p className="text-on-surface">{formatNgn(selected.totalLoss)}</p>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold tracking-wide text-on-surface-variant uppercase">Recovered</p>
              <p className="text-on-surface">{formatNgn(selected.totalRecovered)}</p>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold tracking-wide text-on-surface-variant uppercase">Written off</p>
              <p className="text-on-surface">{formatNgn(selected.totalWrittenOff)}</p>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold tracking-wide text-on-surface-variant uppercase">Outstanding</p>
              <p className="text-on-surface">{formatNgn(selected.outstanding)}</p>
            </div>
          </div>
        )}
      </DetailDrawer>
    </>
  );
}
