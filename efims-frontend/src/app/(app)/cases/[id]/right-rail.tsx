import Link from "next/link";
import {
  Users, Timer, ListChecks, Link2, ShieldCheck, ClipboardCheck, Archive, ShieldAlert,
  Landmark, Wrench, Gavel, type LucideIcon,
} from "lucide-react";
import { requireSession } from "@/features/auth/session";
import { listTasks } from "@/features/tasks/api";
import { listCapaActions } from "@/features/capa/api";
import { listApprovals } from "@/features/workflow/api";
import { listContainmentRequests } from "@/features/containment/api";
import { getCurrentSlaClock } from "@/features/workflow/api";
import { mergeTaskRows } from "@/features/tasks/merge";
import { isPastDeadline } from "@/lib/time";
import { Mono } from "@/components/ui/mono";

const LINKED_WORK_TABS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "approvals", label: "Approvals", icon: Gavel },
  { href: "investigations", label: "Investigations", icon: ShieldCheck },
  { href: "evidence", label: "Evidence", icon: Archive },
  { href: "containment", label: "Containment", icon: ShieldAlert },
  { href: "recovery", label: "Recovery", icon: Landmark },
  { href: "capa", label: "CAPA", icon: Wrench },
  { href: "regulatory", label: "Regulatory", icon: ClipboardCheck },
];

function RailCard({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-4 shadow-card">
      <div className="mb-3 flex items-center gap-2">
        <Icon size={16} className="text-outline" />
        <h3 className="text-xs font-bold tracking-wide text-on-surface uppercase">{title}</h3>
      </div>
      {children}
    </div>
  );
}

/** Case-detail right rail — owner/team, a per-linked-incident SLA panel (there is no case-level
 * SLA clock, only `SlaClock.incidentId` — see `CaseSummary.linkedIncidents`'s own doc comment),
 * a Tasks panel (reuses `mergeTaskRows`, scoped to this one case by wrapping each case-scoped
 * list call's bare rows with this case's own reference/title to match the register-row shape
 * `mergeTaskRows` expects), and static links to this case's own 7 module tabs. "Recent activity"
 * is deliberately NOT included: the only candidate backend filter (`GET /audit-events?entityId=`)
 * only matches direct Case-entity audit events, not the richer CAPA/approval/evidence/etc.
 * activity a reader would actually expect here — better to omit it than show a misleadingly
 * partial feed; a real case-scoped activity filter is a fast-follow, not built under time
 * pressure for this pass. */
export async function CaseRightRail({
  caseId,
  referenceCode,
  title,
  assignedTeamName,
  linkedIncidents,
}: {
  caseId: string;
  referenceCode: string;
  title: string;
  assignedTeamName: string | null;
  linkedIncidents: { id: string; referenceCode: string }[];
}) {
  const { accessToken } = await requireSession();
  const caseInfo = { referenceCode, title };

  const [tasks, capaActions, approvals, containmentRequests, slaClocks] = await Promise.all([
    listTasks(accessToken, caseId),
    listCapaActions(accessToken, caseId),
    listApprovals(accessToken, caseId),
    listContainmentRequests(accessToken, caseId),
    Promise.all(linkedIncidents.map((i) => getCurrentSlaClock(accessToken, i.id))),
  ]);

  const openTasks = tasks.filter((t) => t.status === "OPEN").map((t) => ({ ...t, case: caseInfo }));
  const openCapa = capaActions.filter((c) => c.status === "OPEN" || c.status === "IN_PROGRESS").map((c) => ({ ...c, case: caseInfo }));
  const pendingApprovals = approvals.filter((a) => a.status === "PENDING").map((a) => ({ ...a, case: caseInfo }));
  const requestedContainment = containmentRequests.filter((c) => c.status === "REQUESTED").map((c) => ({ ...c, case: caseInfo }));
  const rows = mergeTaskRows(openTasks, openCapa, pendingApprovals, requestedContainment);

  return (
    <div className="flex flex-col gap-4">
      <RailCard title="Owner" icon={Users}>
        <p className="text-sm text-on-surface">{assignedTeamName ?? "Unassigned"}</p>
      </RailCard>

      <RailCard title="Linked incident SLA" icon={Timer}>
        {linkedIncidents.length === 0 ? (
          <p className="text-xs text-on-surface-variant">No linked incidents.</p>
        ) : (
          <ul className="space-y-2">
            {linkedIncidents.map((incident, i) => {
              const clock = slaClocks[i];
              return (
                <li key={incident.id} className="flex items-center justify-between gap-2">
                  <Link href={`/incidents/${incident.id}`} className="flex items-center gap-1.5 text-xs font-semibold text-tertiary hover:underline">
                    <Mono className="rounded bg-surface-container px-1.5 py-0.5">{incident.referenceCode}</Mono>
                  </Link>
                  {!clock ? (
                    <span className="text-[11px] text-on-surface-variant">No clock</span>
                  ) : clock.isBreached ? (
                    <span className="text-[11px] font-bold text-error">Breached</span>
                  ) : clock.status === "STOPPED" ? (
                    <span className="text-[11px] text-on-surface-variant">Stopped</span>
                  ) : (
                    <span className="text-[11px] font-semibold text-tertiary">{clock.status === "PAUSED" ? "Paused" : "On track"}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </RailCard>

      <RailCard title="Tasks" icon={ListChecks}>
        {rows.length === 0 ? (
          <p className="text-xs text-on-surface-variant">Nothing open on this case.</p>
        ) : (
          <ul className="space-y-2.5">
            {rows.slice(0, 6).map((row) => (
              <li key={row.key}>
                <Link href={row.openHref} className="block text-xs font-medium text-on-surface hover:text-tertiary">
                  {row.title}
                </Link>
                {row.dueAt && (
                  <span className={`text-[11px] ${isPastDeadline(row.dueAt) ? "font-bold text-error" : "text-on-surface-variant"}`}>
                    Due {new Date(row.dueAt).toLocaleDateString()}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </RailCard>

      <RailCard title="Linked work" icon={Link2}>
        <ul className="space-y-1.5">
          {LINKED_WORK_TABS.map((t) => {
            const Icon = t.icon;
            return (
              <li key={t.href}>
                <Link href={`/cases/${caseId}/${t.href}`} className="flex items-center gap-2 text-xs font-medium text-on-surface-variant hover:text-tertiary">
                  <Icon size={14} />
                  {t.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </RailCard>
    </div>
  );
}
