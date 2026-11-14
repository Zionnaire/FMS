"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { StatusBadge } from "@/components/shell/status-badge";
import { SEVERITY_COLOR } from "@/lib/severity-colors";
import type { SeverityTier } from "@/features/cases/types";
import type { DashboardRow } from "./queue-dashboard";

const PAGE_SIZE = 6;
const SEV_FILTERS = [
  { key: "all", label: "All" },
  { key: "s1-s2", label: "S1–S2" },
  { key: "overdue", label: "Overdue" },
] as const;
type SevFilterKey = (typeof SEV_FILTERS)[number]["key"];

function SeverityPill({ severity }: { severity: SeverityTier | null | undefined }) {
  if (!severity) return <span className="text-xs text-on-surface-variant">—</span>;
  const { color } = SEVERITY_COLOR[severity];
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold text-white" style={{ backgroundColor: color }}>
      {severity}
    </span>
  );
}

/** Real operational-queue table (not the flat list `QueueDashboard` falls back to) — used by
 * roles whose rows carry severity/compartment/team/SLA fields (every case-based role's loader).
 * Filtering and pagination both happen over the already-fetched row set client-side: each
 * loader's own backend call already bounds its result (limit 20–100), so there's no case for a
 * second round trip just to slice/filter a set that small. */
export function OperationalQueueTable({ rows, emptyMessage }: { rows: DashboardRow[]; emptyMessage: string }) {
  const [filter, setFilter] = useState<SevFilterKey>("all");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    if (filter === "s1-s2") return rows.filter((r) => r.severity === "S1" || r.severity === "S2");
    if (filter === "overdue") return rows.filter((r) => r.slaBreached);
    return rows;
  }, [rows, filter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(clampedPage * PAGE_SIZE, clampedPage * PAGE_SIZE + PAGE_SIZE);

  function onFilterChange(next: SevFilterKey) {
    setFilter(next);
    setPage(0);
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant/30 bg-surface-container-low px-5 py-3">
        <p className="text-xs text-on-surface-variant">
          {filtered.length === rows.length
            ? `${rows.length} case${rows.length === 1 ? "" : "s"}`
            : `${pageRows.length ? clampedPage * PAGE_SIZE + 1 : 0}–${Math.min(filtered.length, clampedPage * PAGE_SIZE + PAGE_SIZE)} of ${filtered.length} shown`}
        </p>
        <div className="flex gap-1 rounded-full bg-surface-container p-0.5">
          {SEV_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => onFilterChange(f.key)}
              className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${
                filter === f.key ? "bg-primary text-on-primary" : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="p-8 text-center text-sm text-on-surface-variant">{filter === "all" ? emptyMessage : "No rows match this filter."}</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="bg-surface-container-low">
              <TableHead className="w-[38%]">Case</TableHead>
              <TableHead>Compartment</TableHead>
              <TableHead>Sev</TableHead>
              <TableHead>Team</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>SLA</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.map((row) => (
              <TableRow key={row.href} className="cursor-pointer hover:bg-surface-container-low/60">
                <TableCell className="max-w-0 w-[38%]">
                  <Link href={row.href} className="block">
                    <p className="truncate text-sm font-semibold text-on-surface">{row.primary}</p>
                    {row.secondary && <p className="truncate text-xs text-on-surface-variant">{row.secondary}</p>}
                  </Link>
                </TableCell>
                <TableCell className="text-xs text-on-surface-variant">{row.compartment ?? "—"}</TableCell>
                <TableCell><SeverityPill severity={row.severity} /></TableCell>
                <TableCell className="text-xs text-on-surface-variant">{row.team ?? "Unassigned"}</TableCell>
                <TableCell>{row.badge && <StatusBadge status={row.badge.label} tone={row.badge.tone} />}</TableCell>
                <TableCell>
                  {row.slaBreached ? (
                    <span className="text-xs font-semibold text-error">Overdue</span>
                  ) : (
                    <span className="text-xs text-on-surface-variant">On track</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {pageCount > 1 && (
        <div className="flex items-center justify-between gap-2 border-t border-outline-variant/30 px-5 py-3">
          <p className="text-xs text-on-surface-variant">Page {clampedPage + 1} of {pageCount}</p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={clampedPage === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="rounded-full bg-surface-container px-3 py-1.5 text-[11px] font-semibold text-on-surface-variant transition-colors enabled:hover:text-on-surface disabled:opacity-40"
            >
              Prev
            </button>
            <button
              type="button"
              disabled={clampedPage >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              className="rounded-full bg-surface-container px-3 py-1.5 text-[11px] font-semibold text-on-surface-variant transition-colors enabled:hover:text-on-surface disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
