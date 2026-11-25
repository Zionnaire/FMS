import Link from "next/link";
import { Link2, Eye } from "lucide-react";
import { requireSession } from "@/features/auth/session";
import { listIncidents } from "@/features/incidents/api";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const STATUS_TONE_CLASSES: Record<string, string> = {
  positive: "bg-tertiary-fixed text-on-tertiary-fixed-variant",
  warning: "bg-secondary-container text-on-secondary-container",
  critical: "bg-error-container text-on-error-container",
  neutral: "bg-surface-container-high text-on-surface-variant",
};

const STATUS_TONE: Record<string, keyof typeof STATUS_TONE_CLASSES> = {
  OPEN: "warning",
  UNDER_REVIEW: "warning",
  LINKED_TO_CASE: "positive",
  MERGED: "neutral",
  REJECTED: "critical",
  CLOSED_NO_CASE: "neutral",
};

export default async function WhistleblowingPage() {
  const { accessToken } = await requireSession();
  const { incidents, total } = await listIncidents({ accessToken, compartment: "WHISTLEBLOWING", limit: 100 });

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Protected disclosures</h1>
        <p className="mt-1 text-xs text-on-surface-variant">
          {total} disclosure{total === 1 ? "" : "s"} compartmented to WHISTLEBLOWING. Reporter identity is kept in a separate vault from the
          disclosure content, visible only to roles with this compartment grant.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-outline-variant/60 bg-surface-container-lowest shadow-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-surface-container-low">
              <TableHead>Reference &amp; title</TableHead>
              <TableHead>Category / Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Reported</TableHead>
              <TableHead className="text-center">Open</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {incidents.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-sm text-on-surface-variant">
                  No protected disclosures are visible to your role.
                </TableCell>
              </TableRow>
            )}
            {incidents.map((incident) => (
              <TableRow key={incident.id} className="hover:bg-surface-container-low/60">
                <TableCell>
                  <div className="flex flex-col">
                    <span className="w-fit rounded bg-surface-container px-2 py-0.5 font-mono text-xs font-bold text-primary">
                      {incident.referenceCode}
                    </span>
                    <Link href={`/incidents/${incident.id}`} className="mt-1 text-sm font-semibold text-on-surface hover:text-primary hover:underline">
                      {incident.title}
                    </Link>
                    {incident.caseId && (
                      <Link href={`/cases/${incident.caseId}`} className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-tertiary hover:underline">
                        <Link2 size={12} strokeWidth={2} /> View linked case
                      </Link>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <p className="text-sm text-on-surface">{incident.category}</p>
                  <p className="text-xs text-on-surface-variant">{incident.type}</p>
                </TableCell>
                <TableCell>
                  <Badge className={STATUS_TONE_CLASSES[STATUS_TONE[incident.status] ?? "neutral"]}>{incident.status.replaceAll("_", " ")}</Badge>
                </TableCell>
                <TableCell className="text-xs text-on-surface-variant">
                  {new Date(incident.occurredAt ?? incident.createdAt).toLocaleString()}
                </TableCell>
                <TableCell className="text-center">
                  <Link href={`/incidents/${incident.id}`} className="inline-flex rounded-full p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface" title="Open incident">
                    <Eye size={16} strokeWidth={2} />
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
