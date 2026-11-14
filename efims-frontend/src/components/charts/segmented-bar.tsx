"use client";

import { useState } from "react";

/** Part-to-whole, read at a glance, standing alone — the dataviz skill's own form table
 * (`choosing-a-form.md`) is explicit that this is a "tall segmented bar," never a donut/pie, for
 * exactly this shape of data (one whole split into <= 6 named parts). `colorHex` is only used to
 * pick readable inline-label/legend-swatch text (WCAG relative luminance) — `color` (a
 * `var(--color-...)` reference, matching `TrendChart`/`RecoveryBarChart`'s existing convention)
 * is what's actually painted, so this stays theme-token-driven rather than hardcoding hex into
 * the render path. */
export interface SegmentedBarPart {
  key: string;
  label: string;
  value: number;
  color: string;
  colorHex: string;
}

function relativeLuminance(hex: string): number {
  const c = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);
  const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Per marks-and-anatomy.md's "Labels & legend": a label set inside a colored fill is white or
 * near-black by the fill's own luminance, never a fixed scheme. */
function textOn(hex: string): string {
  return relativeLuminance(hex) > 0.45 ? "#0f172a" : "#ffffff";
}

/** Tall segmented bar: 28px thick, 4px corners per part, 2px surface-color gaps, share% printed
 * inside a part only when it's wide enough to hold it without crowding — per spec, a part too
 * narrow for its label prints none; the legend + hover/focus tooltip still carry every value. */
export function SegmentedBar({ parts, unit = "" }: { parts: SegmentedBarPart[]; unit?: string }) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const total = parts.reduce((sum, p) => sum + p.value, 0);

  if (total === 0) {
    return <p className="py-2 text-xs text-on-surface-variant">No data in this set yet.</p>;
  }

  const visible = parts.filter((p) => p.value > 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-7 gap-0.5" role="img" aria-label={visible.map((p) => `${p.label}: ${p.value} (${Math.round((p.value / total) * 100)}%)`).join(", ")}>
        {visible.map((p) => {
          const share = p.value / total;
          const pct = Math.round(share * 100);
          const canLabel = share >= 0.1;
          const isActive = activeKey === p.key;
          return (
            <div
              key={p.key}
              tabIndex={0}
              title={`${p.label}: ${p.value}${unit} (${pct}%)`}
              onMouseEnter={() => setActiveKey(p.key)}
              onMouseLeave={() => setActiveKey(null)}
              onFocus={() => setActiveKey(p.key)}
              onBlur={() => setActiveKey(null)}
              style={{ width: `${share * 100}%`, backgroundColor: p.color }}
              className={`flex items-center overflow-hidden rounded-[4px] px-1.5 outline-none transition-[filter] ${isActive ? "brightness-110 ring-2 ring-offset-1 ring-offset-surface-container-lowest ring-on-surface/20" : ""}`}
            >
              {canLabel && (
                <span className="truncate text-[10px] font-bold tabular-nums" style={{ color: textOn(p.colorHex) }}>
                  {pct}%
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {parts.map((p) => (
          <div key={p.key} className="flex items-center gap-1.5 text-[11px] text-on-surface-variant">
            <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ backgroundColor: p.color }} />
            <span>{p.label}</span>
            <span className="font-semibold text-on-surface">{p.value}{unit}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
