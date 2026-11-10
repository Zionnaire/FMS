"use client";

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

/** First real chart in this app — until now every page was a KPI number tile or a table, with no
 * charting library installed at all. Kept deliberately plain (theme tokens for color, no 3D/
 * gradient flourish) per the "defensive contrast, no decorative color" principle carried over
 * from the Vanguard Precision blend. Generic over the data point shape (just needs a `date`) so
 * each caller's own trend-result type — already typed server-side — can be passed straight
 * through without an index signature forcing every field to be `string | number`. */
export interface TrendSeries {
  key: string;
  label: string;
  color: string;
}

export function TrendChart<T extends { date: string }>({
  data,
  series,
  height = 220,
}: {
  data: T[];
  series: TrendSeries[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          {series.map((s) => (
            <linearGradient key={s.key} id={`trend-fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-outline-variant)" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: "var(--color-on-surface-variant)" }}
          axisLine={{ stroke: "var(--color-outline-variant)" }}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "var(--color-on-surface-variant)" }}
          axisLine={false}
          tickLine={false}
          width={32}
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
        {series.map((s) => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            strokeWidth={2}
            fill={`url(#trend-fill-${s.key})`}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
