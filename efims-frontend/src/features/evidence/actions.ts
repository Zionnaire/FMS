"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/features/auth/session";
import type { FormState } from "@/lib/form-state";
import { parseActionError } from "@/lib/form-state";
import type { EvidenceCategory } from "./types";
import * as api from "./api";

function path(caseId: string) {
  return `/cases/${caseId}/evidence`;
}

export async function ingestEvidenceAction(caseId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const { accessToken } = await requireSession();
  try {
    await api.ingestEvidence(accessToken, caseId, {
      category: formData.get("category") as EvidenceCategory,
      title: String(formData.get("title") ?? ""),
      description: (formData.get("description") as string) || undefined,
      externalRef: (formData.get("externalRef") as string) || undefined,
      sourceSystem: (formData.get("sourceSystem") as string) || undefined,
      content: String(formData.get("content") ?? ""),
    });
  } catch (error) {
    return parseActionError(error);
  }
  revalidatePath(path(caseId));
  return {};
}

export async function recordCustodyEventAction(caseId: string, evidenceId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const { accessToken } = await requireSession();
  try {
    await api.recordCustodyEvent(accessToken, caseId, evidenceId, {
      action: String(formData.get("action") ?? ""),
      relatedUserId: (formData.get("relatedUserId") as string) || undefined,
      notes: (formData.get("notes") as string) || undefined,
    });
  } catch (error) {
    return parseActionError(error);
  }
  revalidatePath(path(caseId));
  return {};
}

export interface VerifyEvidenceActionResult {
  intact: boolean;
  storedHash: string;
  recomputedHash: string;
}

export async function verifyEvidenceAction(caseId: string, evidenceId: string, formData: FormData): Promise<VerifyEvidenceActionResult> {
  const { accessToken } = await requireSession();
  const result = await api.verifyEvidence(accessToken, caseId, evidenceId, String(formData.get("content") ?? ""));
  revalidatePath(path(caseId));
  return result;
}

export async function setLegalHoldAction(caseId: string, evidenceId: string, hold: boolean, _prevState: FormState, formData: FormData): Promise<FormState> {
  const { accessToken } = await requireSession();
  try {
    await api.setLegalHold(accessToken, caseId, evidenceId, { hold, reason: (formData.get("reason") as string) || undefined });
  } catch (error) {
    return parseActionError(error);
  }
  revalidatePath(path(caseId));
  return {};
}
