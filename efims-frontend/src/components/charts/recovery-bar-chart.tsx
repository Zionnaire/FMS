"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

export interface RecoveryBarPoint {
  caseRef: string;
  loss: number;
  recovered: number;
}

/** Compact axis ticks for large NGN amounts (1,000,000 -> "1M") — the fixed-width tick column
 * below was clipping full numbers (e.g. "4,350,000" rendering as "00000", its leading digits cut
 * off-canvas since SVG tick text overflows the allocated width silently). Real values stay fully
 * reachable via the tooltip and the legend; this only affects the axis labels. */
function formatCompactNgn(value: number): string {
  return new Intl.NumberFormat("en-NG", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

/** Second real chart in this app (after `TrendChart`) — same plain, token-driven styling, no
 * library default palette. Paired bars (verified loss vs. reconciled recovery) per case, matching
 * the hybrid design spec's §5.3 "Recovery — paired bars" pattern. Fed by data the `/recovery`
 * register endpoint already returns per case; aggregated/sliced by the caller, not here. */
export function RecoveryBarChart({ data, height = 240 }: { data: RecoveryBarPoint[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-outline-variant)" vertical={false} />
        <XAxis
          dataKey="caseRef"
          tick={{ fontSize: 11, fill: "var(--color-on-surface-variant)" }}
          axisLine={{ stroke: "var(--color-outline-variant)" }}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "var(--color-on-surface-variant)" }}
          axisLine={false}
          tickLine={false}
          width={48}
          tickFormatter={formatCompactNgn}
        />
        <Tooltip
          contentStyle={{
            background: "var(--color-surface-container-lowest)",
            border: "1px solid var(--color-outline-variant)",
            borderRadius: 8,
            fontSize: 12,
          }}
          labelStyle={{ color: "var(--color-on-surface)", fontWeight: 600 }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="loss" name="Verified loss" fill="var(--color-error)" radius={[4, 4, 0, 0]} />
        <Bar dataKey="recovered" name="Reconciled recovery" fill="var(--color-tertiary)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
