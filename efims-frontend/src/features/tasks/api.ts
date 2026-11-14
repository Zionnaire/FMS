import "server-only";
import { backendFetch } from "@/lib/backend-client";
import type { Task, TaskPriority, TaskRegisterRow } from "./types";

const base = (caseId: string) => `/cases/${caseId}/tasks`;

export interface CreateTaskInput {
  title: string;
  description?: string;
  priority?: TaskPriority;
  assigneeUserId: string;
  dueAt?: string;
}

export async function createTask(accessToken: string, caseId: string, input: CreateTaskInput): Promise<Task> {
  return backendFetch<Task>(base(caseId), { method: "POST", body: input, accessToken });
}

export async function listTasks(accessToken: string, caseId: string): Promise<Task[]> {
  return backendFetch<Task[]>(base(caseId), { accessToken });
}

export async function completeTask(accessToken: string, caseId: string, taskId: string): Promise<Task> {
  return backendFetch<Task>(`${base(caseId)}/${taskId}/complete`, { method: "POST", accessToken });
}

export async function cancelTask(accessToken: string, caseId: string, taskId: string, reason: string): Promise<Task> {
  return backendFetch<Task>(`${base(caseId)}/${taskId}/cancel`, { method: "POST", body: { reason }, accessToken });
}

/** General cross-case register for the Tasks tab — real, freestanding tasks only. The Tasks tab
 * itself merges this with CAPA/approvals/containment's own registers — see
 * `src/app/(app)/cases/tasks-table.tsx`'s own doc comment. */
export async function getTasksRegister(accessToken: string): Promise<TaskRegisterRow[]> {
  return backendFetch<TaskRegisterRow[]>("/tasks", { accessToken });
}
