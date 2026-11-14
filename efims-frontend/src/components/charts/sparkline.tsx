"use client";

import { AreaChart, Area, ResponsiveContainer } from "recharts";

/** Stat-tile "trend" per the dataviz skill's figures spec: a compact inline sparkline in the
 * de-emphasis (muted) hue, with the current/latest point called out in the accent color — never
 * a full axis/gridline/tooltip chart (that's `TrendChart`'s job), just a shape for "is this
 * trending up or down lately." */
export function Sparkline({ data, accent = "var(--color-primary)", height = 36 }: { data: number[]; accent?: string; height?: number }) {
  if (data.length < 2) return null;
  const points = data.map((value, i) => ({ i, value }));
  const last = points[points.length - 1];

  return (
    <div style={{ width: 72, height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
          <defs>
            <linearGradient id="sparkline-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-outline)" stopOpacity={0.25} />
              <stop offset="100%" stopColor="var(--color-outline)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke="var(--color-outline)"
            strokeWidth={1.5}
            fill="url(#sparkline-fill)"
            isAnimationActive={false}
            dot={(props) => {
              const { cx, cy, payload } = props;
              if (payload.i !== last.i) return <g key={payload.i} />;
              return <circle key="last" cx={cx} cy={cy} r={3} fill={accent} stroke="var(--color-surface-container-lowest)" strokeWidth={1.5} />;
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
