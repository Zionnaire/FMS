"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/features/auth/session";
import type { FormState } from "@/lib/form-state";
import { parseActionError } from "@/lib/form-state";
import type { ContainmentActionType } from "./types";
import * as api from "./api";

function path(caseId: string) {
  return `/cases/${caseId}/containment`;
}

export async function createContainmentRequestAction(caseId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const { accessToken } = await requireSession();
  try {
    await api.createContainmentRequest(accessToken, caseId, {
      approvalId: String(formData.get("approvalId") ?? ""),
      actionType: formData.get("actionType") as ContainmentActionType,
      targetDescription: String(formData.get("targetDescription") ?? ""),
      rationale: String(formData.get("rationale") ?? ""),
    });
  } catch (error) {
    return parseActionError(error);
  }
  revalidatePath(path(caseId));
  return {};
}

export async function confirmContainmentRequestAction(caseId: string, requestId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const { accessToken } = await requireSession();
  try {
    await api.confirmContainmentRequest(accessToken, caseId, requestId, (formData.get("confirmationRef") as string) || undefined);
  } catch (error) {
    return parseActionError(error);
  }
  revalidatePath(path(caseId));
  return {};
}

export async function rejectContainmentRequestAction(caseId: string, requestId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const { accessToken } = await requireSession();
  try {
    await api.rejectContainmentRequest(accessToken, caseId, requestId, String(formData.get("reason") ?? ""));
  } catch (error) {
    return parseActionError(error);
  }
  revalidatePath(path(caseId));
  return {};
}

export async function cancelContainmentRequestAction(caseId: string, requestId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const { accessToken } = await requireSession();
  try {
    await api.cancelContainmentRequest(accessToken, caseId, requestId, String(formData.get("reason") ?? ""));
  } catch (error) {
    return parseActionError(error);
  }
  revalidatePath(path(caseId));
  return {};
}
