import type { TaskRegisterRow } from "./types";
import type { CapaRegisterRow } from "../capa/types";
import type { ApprovalRegisterRow } from "../workflow/types";
import type { ContainmentRegisterRow } from "../containment/types";

export type MergedTaskKind = "task" | "capa" | "approval" | "containment";

/** One unified row shape for the Cases page's Tasks tab. A generic "mark done" action is unsafe
 * for 3 of these 4 sources (CD-04 approval gates, segregation of duties, confirmation-gating), so
 * only `kind === "task"` rows carry a real complete/cancel action here — the other three always
 * route "open" to the real case-detail tab where the actual, rule-respecting action lives. See
 * `Task`'s own doc comment in schema.prisma for the full reasoning. */
export interface MergedTaskRow {
  key: string;
  kind: MergedTaskKind;
  sourceId: string;
  title: string;
  caseId: string;
  caseRef: string;
  caseTitle: string;
  assignee: string | null;
  dueAt: string | null;
  status: string;
  openHref: string;
}

/** Pure merge — no I/O. The four source arrays are each already filtered to "not finished yet"
 * by the caller (OPEN/IN_PROGRESS CAPA actions, PENDING approvals, REQUESTED containment
 * requests) before being passed in, same discipline as every other register page's in-memory
 * filtering on this project (`approvals/page.tsx`'s own `byStatus` pattern). */
export function mergeTaskRows(
  tasks: TaskRegisterRow[],
  capaActions: CapaRegisterRow[],
  approvals: ApprovalRegisterRow[],
  containmentRequests: ContainmentRegisterRow[],
): MergedTaskRow[] {
  const rows: MergedTaskRow[] = [
    ...tasks.map((t): MergedTaskRow => ({
      key: `task:${t.id}`,
      kind: "task",
      sourceId: t.id,
      title: t.title,
      caseId: t.caseId,
      caseRef: t.case.referenceCode,
      caseTitle: t.case.title,
      assignee: t.assigneeUserId,
      dueAt: t.dueAt,
      status: t.status,
      openHref: `/cases/${t.caseId}`,
    })),
    ...capaActions.map((c): MergedTaskRow => ({
      key: `capa:${c.id}`,
      kind: "capa",
      sourceId: c.id,
      title: c.title,
      caseId: c.caseId,
      caseRef: c.case.referenceCode,
      caseTitle: c.case.title,
      assignee: c.ownerId,
      dueAt: c.dueDate,
      status: c.status,
      openHref: `/cases/${c.caseId}/capa`,
    })),
    ...approvals.map((a): MergedTaskRow => ({
      key: `approval:${a.id}`,
      kind: "approval",
      sourceId: a.id,
      title: `${a.action.replaceAll("_", " ")} approval`,
      caseId: a.caseId,
      caseRef: a.case.referenceCode,
      caseTitle: a.case.title,
      assignee: null,
      dueAt: null,
      status: a.status,
      openHref: `/cases/${a.caseId}/approvals`,
    })),
    ...containmentRequests.map((c): MergedTaskRow => ({
      key: `containment:${c.id}`,
      kind: "containment",
      sourceId: c.id,
      title: `${c.actionType.replaceAll("_", " ")} — ${c.targetDescription}`,
      caseId: c.caseId,
      caseRef: c.case.referenceCode,
      caseTitle: c.case.title,
      assignee: null,
      dueAt: null,
      status: c.status,
      openHref: `/cases/${c.caseId}/containment`,
    })),
  ];

  return rows.sort((a, b) => {
    if (a.dueAt && b.dueAt) return a.dueAt.localeCompare(b.dueAt);
    if (a.dueAt) return -1;
    if (b.dueAt) return 1;
    return 0;
  });
}
