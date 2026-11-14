"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/features/auth/session";
import type { FormState } from "@/lib/form-state";
import { parseActionError } from "@/lib/form-state";
import * as api from "./api";

function path(caseId: string) {
  return `/cases/${caseId}`;
}

export async function createTaskAction(caseId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const { accessToken } = await requireSession();
  try {
    await api.createTask(accessToken, caseId, {
      title: String(formData.get("title") ?? ""),
      description: (formData.get("description") as string) || undefined,
      priority: (formData.get("priority") as api.CreateTaskInput["priority"]) || undefined,
      assigneeUserId: String(formData.get("assigneeUserId") ?? ""),
      dueAt: (formData.get("dueAt") as string) || undefined,
    });
  } catch (error) {
    return parseActionError(error);
  }
  revalidatePath(path(caseId));
  revalidatePath("/cases");
  return {};
}

/** Plain `<form action={completeTaskAction.bind(null, caseId, taskId)}>` action, no form fields
 * needed — same no-prevState shape as `startCapaActionAction`. */
export async function completeTaskAction(caseId: string, taskId: string): Promise<void> {
  const { accessToken } = await requireSession();
  await api.completeTask(accessToken, caseId, taskId);
  revalidatePath(path(caseId));
  revalidatePath("/cases");
}

/** FormState shape (needs a `reason` field) — same convention as `cancelCapaActionAction`. */
export async function cancelTaskAction(caseId: string, taskId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const { accessToken } = await requireSession();
  try {
    await api.cancelTask(accessToken, caseId, taskId, String(formData.get("reason") ?? ""));
  } catch (error) {
    return parseActionError(error);
  }
  revalidatePath(path(caseId));
  revalidatePath("/cases");
  return {};
}
