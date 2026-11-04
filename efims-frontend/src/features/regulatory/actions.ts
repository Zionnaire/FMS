"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/features/auth/session";
import type { FormState } from "@/lib/form-state";
import { parseActionError } from "@/lib/form-state";
import type { ObligationType } from "./types";
import * as api from "./api";

function path(caseId: string) {
  return `/cases/${caseId}/regulatory`;
}

export async function createObligationAction(caseId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const { accessToken } = await requireSession();
  try {
    await api.createObligation(accessToken, caseId, {
      obligationType: formData.get("obligationType") as ObligationType,
      description: String(formData.get("description") ?? ""),
      regulatorName: (formData.get("regulatorName") as string) || undefined,
      deadline: String(formData.get("deadline") ?? ""),
    });
  } catch (error) {
    return parseActionError(error);
  }
  revalidatePath(path(caseId));
  return {};
}

export async function submitObligationAction(caseId: string, obligationId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const { accessToken } = await requireSession();
  try {
    await api.submitObligation(accessToken, caseId, obligationId, {
      approvalId: String(formData.get("approvalId") ?? ""),
      referenceNumber: (formData.get("referenceNumber") as string) || undefined,
      notes: (formData.get("notes") as string) || undefined,
    });
  } catch (error) {
    return parseActionError(error);
  }
  revalidatePath(path(caseId));
  return {};
}

export async function acknowledgeObligationAction(caseId: string, obligationId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const { accessToken } = await requireSession();
  try {
    await api.acknowledgeObligation(accessToken, caseId, obligationId, (formData.get("acknowledgedRef") as string) || undefined);
  } catch (error) {
    return parseActionError(error);
  }
  revalidatePath(path(caseId));
  return {};
}

export async function waiveObligationAction(caseId: string, obligationId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const { accessToken } = await requireSession();
  try {
    await api.waiveObligation(accessToken, caseId, obligationId, String(formData.get("reason") ?? ""));
  } catch (error) {
    return parseActionError(error);
  }
  revalidatePath(path(caseId));
  return {};
}
