import type { SeverityTier } from "@/features/cases/types";

/** Single source of truth for severity → color, so the executive dashboard's segmented bars, the
 * operational-queue table's SEV pills, and any KPI dot sharing a severity tier all agree — split
 * out after the same mapping started getting duplicated across files. `color` is a
 * `var(--color-...)` reference (theme-token-driven, matches every other chart in this app);
 * `colorHex` is the literal value, needed wherever a component must compute text contrast
 * (luminance) rather than just paint a background. */
export const SEVERITY_COLOR: Record<SeverityTier, { color: string; colorHex: string }> = {
  S1: { color: "var(--color-severity-s1)", colorHex: "#ef4444" },
  S2: { color: "var(--color-severity-s2)", colorHex: "#f97316" },
  S3: { color: "var(--color-severity-s3)", colorHex: "#f59e0b" },
  S4: { color: "var(--color-severity-s4)", colorHex: "#64748b" },
};
