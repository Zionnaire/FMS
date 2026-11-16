import { Badge } from "@/components/ui/badge";

const TONE_CLASSES: Record<string, string> = {
  positive: "bg-success-container text-success",
  warning: "bg-warning-status-container text-warning-status",
  critical: "bg-error-container text-on-error-container",
  neutral: "bg-surface-container-high text-on-surface-variant",
};

/** Consistent status-pill styling reused across incidents/cases/approvals/containment/etc — a
 * `tone` picks the color family, the label is always the raw enum value with underscores
 * replaced by spaces (never a bespoke label lookup table per status, which would drift). */
export function StatusBadge({ status, tone = "neutral" }: { status: string; tone?: keyof typeof TONE_CLASSES }) {
  return <Badge className={TONE_CLASSES[tone]}>{status.replaceAll("_", " ")}</Badge>;
}
