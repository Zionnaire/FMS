"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/features/auth/session";
import type { Compartment } from "@/features/auth/types";
import type { FormState } from "@/lib/form-state";
import { parseActionError } from "@/lib/form-state";
import type { SignalSource } from "./types";
import * as api from "./api";

export async function createSignalAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const { accessToken } = await requireSession();
  const source = formData.get("source") as SignalSource;
  const isAnonymous = formData.get("isAnonymous") === "on";

  let created;
  try {
    created = await api.createSignal(accessToken, {
      source,
      externalRef: (formData.get("externalRef") as string) || undefined,
      summary: String(formData.get("summary") ?? ""),
      isAnonymous: source === "WHISTLEBLOWER" ? isAnonymous : undefined,
      reporterName: source === "WHISTLEBLOWER" && !isAnonymous ? (formData.get("reporterName") as string) || undefined : undefined,
      reporterContact: source === "WHISTLEBLOWER" ? (formData.get("reporterContact") as string) || undefined : undefined,
    });
  } catch (error) {
    return parseActionError(error);
  }

  revalidatePath("/signals");
  redirect(`/signals/${created.id}`);
}

export async function validateSignalAction(signalId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const { accessToken } = await requireSession();
  const linkToIncidentId = (formData.get("linkToIncidentId") as string) || undefined;

  let validated;
  try {
    validated = await api.validateSignal(accessToken, signalId, {
      linkToIncidentId,
      category: linkToIncidentId ? undefined : (formData.get("category") as string) || undefined,
      type: linkToIncidentId ? undefined : (formData.get("type") as string) || undefined,
      subtype: (formData.get("subtype") as string) || undefined,
      title: linkToIncidentId ? undefined : (formData.get("title") as string) || undefined,
      description: linkToIncidentId ? undefined : (formData.get("description") as string) || undefined,
      compartment: (formData.get("compartment") as Compartment) || undefined,
      occurredAt: (formData.get("occurredAt") as string) || undefined,
    });
  } catch (error) {
    return parseActionError(error);
  }

  revalidatePath("/signals");
  // validate() returns the updated Signal, not the Incident — the new/linked incident's id lives
  // on its `incidentId` field, never `.id` (that's still the signal's own id).
  redirect(`/incidents/${validated.incidentId}`);
}

export async function rejectSignalAction(signalId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const { accessToken } = await requireSession();
  try {
    await api.rejectSignal(accessToken, signalId, String(formData.get("reason") ?? ""));
  } catch (error) {
    return parseActionError(error);
  }
  revalidatePath("/signals");
  revalidatePath(`/signals/${signalId}`);
  return {};
}
