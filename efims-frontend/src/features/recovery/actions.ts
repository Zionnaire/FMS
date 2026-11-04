"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/features/auth/session";
import type { FormState } from "@/lib/form-state";
import { parseActionError } from "@/lib/form-state";
import type { LossCategory, RecoveryMethod } from "./types";
import * as api from "./api";

function path(caseId: string) {
  return `/cases/${caseId}/recovery`;
}

export async function recordLossAction(caseId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const { accessToken } = await requireSession();
  try {
    await api.recordLoss(accessToken, caseId, {
      amount: Number(formData.get("amount") ?? 0),
      category: formData.get("category") as LossCategory,
      description: (formData.get("description") as string) || undefined,
    });
  } catch (error) {
    return parseActionError(error);
  }
  revalidatePath(path(caseId));
  return {};
}

export async function recordRecoveryAction(caseId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const { accessToken } = await requireSession();
  try {
    await api.recordRecovery(accessToken, caseId, {
      amount: Number(formData.get("amount") ?? 0),
      method: formData.get("method") as RecoveryMethod,
      description: (formData.get("description") as string) || undefined,
    });
  } catch (error) {
    return parseActionError(error);
  }
  revalidatePath(path(caseId));
  return {};
}

export async function recordWriteOffAction(caseId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const { accessToken } = await requireSession();
  try {
    await api.recordWriteOff(accessToken, caseId, {
      approvalId: String(formData.get("approvalId") ?? ""),
      amount: Number(formData.get("amount") ?? 0),
      justification: String(formData.get("justification") ?? ""),
    });
  } catch (error) {
    return parseActionError(error);
  }
  revalidatePath(path(caseId));
  return {};
}
