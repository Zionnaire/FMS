"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/features/auth/session";
import type { FormState } from "@/lib/form-state";
import { parseActionError } from "@/lib/form-state";
import type { CdKey } from "./types";
import * as api from "./api";

export async function createConfigurationDraftAction(key: CdKey, _prevState: FormState, formData: FormData): Promise<FormState> {
  const { accessToken } = await requireSession();
  const valueText = String(formData.get("value") ?? "{}");
  let value: Record<string, unknown>;
  try {
    value = JSON.parse(valueText);
  } catch {
    return { error: "Value must be valid JSON" };
  }
  try {
    await api.createConfigurationDraft(accessToken, key, { value, notes: (formData.get("notes") as string) || undefined });
  } catch (error) {
    return parseActionError(error);
  }
  revalidatePath(`/configuration/${key}`);
  return {};
}

export async function ratifyConfigurationVersionAction(key: CdKey, version: number, _prevState: FormState, formData: FormData): Promise<FormState> {
  const { accessToken } = await requireSession();
  try {
    await api.ratifyConfigurationVersion(accessToken, key, version, {
      effectiveDate: (formData.get("effectiveDate") as string) || undefined,
      notes: (formData.get("notes") as string) || undefined,
    });
  } catch (error) {
    return parseActionError(error);
  }
  revalidatePath(`/configuration/${key}`);
  revalidatePath("/configuration");
  return {};
}
