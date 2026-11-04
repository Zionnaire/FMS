"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/features/auth/session";
import type { FormState } from "@/lib/form-state";
import { parseActionError } from "@/lib/form-state";
import type { CapaActionType, CapaValidationOutcome } from "./types";
import * as api from "./api";

function path(caseId: string) {
  return `/cases/${caseId}/capa`;
}

export async function createRootCauseAction(caseId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const { accessToken } = await requireSession();
  try {
    await api.createRootCause(accessToken, caseId, {
      summary: String(formData.get("summary") ?? ""),
      analysisMethod: (formData.get("analysisMethod") as string) || undefined,
    });
  } catch (error) {
    return parseActionError(error);
  }
  revalidatePath(path(caseId));
  return {};
}

export async function createCapaActionAction(caseId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const { accessToken } = await requireSession();
  try {
    await api.createCapaAction(accessToken, caseId, {
      rootCauseId: (formData.get("rootCauseId") as string) || undefined,
      type: formData.get("type") as CapaActionType,
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? ""),
      ownerId: String(formData.get("ownerId") ?? ""),
      dueDate: String(formData.get("dueDate") ?? ""),
    });
  } catch (error) {
    return parseActionError(error);
  }
  revalidatePath(path(caseId));
  return {};
}

export async function startCapaActionAction(caseId: string, actionId: string): Promise<void> {
  const { accessToken } = await requireSession();
  await api.startCapaAction(accessToken, caseId, actionId);
  revalidatePath(path(caseId));
}

export async function completeCapaActionAction(caseId: string, actionId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const { accessToken } = await requireSession();
  try {
    await api.completeCapaAction(accessToken, caseId, actionId, (formData.get("completionNotes") as string) || undefined);
  } catch (error) {
    return parseActionError(error);
  }
  revalidatePath(path(caseId));
  return {};
}

export async function cancelCapaActionAction(caseId: string, actionId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const { accessToken } = await requireSession();
  try {
    await api.cancelCapaAction(accessToken, caseId, actionId, String(formData.get("reason") ?? ""));
  } catch (error) {
    return parseActionError(error);
  }
  revalidatePath(path(caseId));
  return {};
}

export async function validateCapaActionAction(caseId: string, actionId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const { accessToken } = await requireSession();
  try {
    await api.validateCapaAction(accessToken, caseId, actionId, {
      outcome: formData.get("outcome") as CapaValidationOutcome,
      notes: (formData.get("notes") as string) || undefined,
    });
  } catch (error) {
    return parseActionError(error);
  }
  revalidatePath(path(caseId));
  return {};
}
