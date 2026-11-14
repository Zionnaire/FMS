export const TASK_STATUSES = ["OPEN", "DONE", "CANCELLED"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export interface Task {
  id: string;
  tenantId: string;
  caseId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeUserId: string;
  dueAt: string | null;
  createdBy: string;
  createdAt: string;
  completedAt: string | null;
  cancelledReason: string | null;
  cancelledAt: string | null;
}

/** `GET /tasks`'s row shape — one row per freestanding task across every accessible case. This
 * is NOT the full Tasks-tab register: that view unions this with derived rows from CAPA/
 * approvals/containment — see `src/app/(app)/cases/tasks-table.tsx`'s own doc comment for why. */
export interface TaskRegisterRow extends Task {
  case: { referenceCode: string; title: string };
}
