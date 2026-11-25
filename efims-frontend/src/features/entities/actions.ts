"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/features/auth/session";
import type { FormState } from "@/lib/form-state";
import { parseActionError } from "@/lib/form-state";
import type { EntityCaseLinkRole, EntityIdentifierType, EntityRelationshipType, EntityType, RiskBand, RiskFactor } from "./types";
import * as api from "./api";

export async function createEntityAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const { accessToken } = await requireSession();

  let created;
  try {
    created = await api.createEntity(accessToken, {
      type: formData.get("type") as EntityType,
      displayName: String(formData.get("displayName") ?? ""),
    });
  } catch (error) {
    return parseActionError(error);
  }

  revalidatePath("/entities");
  redirect(`/entities/${created.id}`);
}

export async function updateEntityAction(entityId: string, formData: FormData): Promise<void> {
  const { accessToken } = await requireSession();
  await api.updateEntity(accessToken, entityId, String(formData.get("displayName") ?? ""));
  revalidatePath(`/entities/${entityId}`);
}

export async function deleteEntityAction(entityId: string): Promise<void> {
  const { accessToken } = await requireSession();
  await api.deleteEntity(accessToken, entityId);
  revalidatePath("/entities");
  redirect("/entities");
}

export async function addIdentifierAction(entityId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const { accessToken } = await requireSession();
  try {
    await api.addIdentifier(accessToken, entityId, formData.get("type") as EntityIdentifierType, String(formData.get("value") ?? ""));
  } catch (error) {
    return parseActionError(error);
  }
  revalidatePath(`/entities/${entityId}`);
  return {};
}

export async function addRelationshipAction(entityId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const { accessToken } = await requireSession();
  try {
    await api.addRelationship(
      accessToken,
      entityId,
      String(formData.get("toEntityId") ?? ""),
      formData.get("relationshipType") as EntityRelationshipType,
      (formData.get("rationale") as string) || undefined,
    );
  } catch (error) {
    return parseActionError(error);
  }
  revalidatePath(`/entities/${entityId}`);
  return {};
}

export async function removeRelationshipAction(entityId: string, relationshipId: string): Promise<void> {
  const { accessToken } = await requireSession();
  await api.removeRelationship(accessToken, entityId, relationshipId);
  revalidatePath(`/entities/${entityId}`);
}

export async function linkCaseAction(entityId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const { accessToken } = await requireSession();
  try {
    await api.linkCase(accessToken, entityId, String(formData.get("caseId") ?? ""), formData.get("role") as EntityCaseLinkRole);
  } catch (error) {
    return parseActionError(error);
  }
  revalidatePath(`/entities/${entityId}`);
  return {};
}

export async function unlinkCaseAction(entityId: string, caseId: string): Promise<void> {
  const { accessToken } = await requireSession();
  await api.unlinkCase(accessToken, entityId, caseId);
  revalidatePath(`/entities/${entityId}`);
}

/** `factors` arrives as a JSON string from a hidden field — the risk-factor editor is a Client
 * Component (add/remove rows before submit), so it serializes its working array into one hidden
 * input rather than needing N separate `useActionState` round trips. */
export async function recordRiskAssessmentAction(entityId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const { accessToken } = await requireSession();
  const factors = JSON.parse(String(formData.get("factors") ?? "[]")) as RiskFactor[];
  try {
    await api.recordRiskAssessment(accessToken, entityId, formData.get("band") as RiskBand, factors);
  } catch (error) {
    return parseActionError(error);
  }
  revalidatePath(`/entities/${entityId}`);
  return {};
}

export async function setWatchlistAction(entityId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const { accessToken } = await requireSession();
  const watchlisted = formData.get("watchlisted") === "true";
  try {
    await api.setWatchlist(accessToken, entityId, watchlisted, (formData.get("reason") as string) || undefined);
  } catch (error) {
    return parseActionError(error);
  }
  revalidatePath(`/entities/${entityId}`);
  return {};
}
