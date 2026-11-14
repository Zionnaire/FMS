"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export interface ActivityTrendPoint {
  date: string;
  value: number;
}

/** A single-series trend — "tell the reader if this is going up or down lately," not a
 * multi-series breakdown (that's `TrendChart`'s job, e.g. the Analytics tab's per-severity
 * lines). Per the dataviz skill: a single series needs no legend box (the card's own title
 * already names what's plotted); a 2px line with an end-dot in the accent color, hover
 * crosshair + tooltip included since this is a full chart, not a bare stat tile. */
export function ActivityTrendChart({ data, height = 220, color = "var(--color-primary)" }: { data: ActivityTrendPoint[]; height?: number; color?: string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-outline-variant)" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: "var(--color-on-surface-variant)" }}
          axisLine={{ stroke: "var(--color-outline-variant)" }}
          tickLine={false}
          minTickGap={40}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "var(--color-on-surface-variant)" }}
          axisLine={false}
          tickLine={false}
          width={28}
          allowDecimals={false}
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
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: color, stroke: "var(--color-surface-container-lowest)", strokeWidth: 1.5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
