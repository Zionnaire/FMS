"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/features/auth/session";
import type { Compartment } from "@/features/auth/types";
import type { FormState } from "@/lib/form-state";
import { parseActionError } from "@/lib/form-state";
import type { CaseStatus, CaseUserRelationType } from "./types";
import * as api from "./api";

export async function createCaseAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const { accessToken } = await requireSession();
  const incidentIdsRaw = formData.get("incidentIds");

  let created;
  try {
    created = await api.createCase(accessToken, {
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? ""),
      sensitivityLevel: Number(formData.get("sensitivityLevel") ?? 1),
      compartment: (formData.get("compartment") as Compartment) || undefined,
      assignedTeamId: (formData.get("assignedTeamId") as string) || undefined,
      incidentIds: incidentIdsRaw ? String(incidentIdsRaw).split(",").map((s) => s.trim()).filter(Boolean) : undefined,
    });
  } catch (error) {
    return parseActionError(error);
  }

  revalidatePath("/cases");
  redirect(`/cases/${created.id}`);
}

export async function updateCaseStatusAction(caseId: string, formData: FormData): Promise<void> {
  const { accessToken } = await requireSession();
  await api.updateCaseStatus(accessToken, caseId, {
    status: formData.get("status") as CaseStatus,
    reason: (formData.get("reason") as string) || undefined,
    approvalId: (formData.get("approvalId") as string) || undefined,
  });
  revalidatePath(`/cases/${caseId}`);
}

export async function assignCaseTeamAction(caseId: string, formData: FormData): Promise<void> {
  const { accessToken } = await requireSession();
  await api.assignCaseTeam(accessToken, caseId, String(formData.get("teamId") ?? ""));
  revalidatePath(`/cases/${caseId}`);
}

export async function linkIncidentAction(caseId: string, formData: FormData): Promise<void> {
  const { accessToken } = await requireSession();
  await api.linkIncidentToCase(accessToken, caseId, String(formData.get("incidentId") ?? ""));
  revalidatePath(`/cases/${caseId}`);
}

export async function addCaseFlagAction(caseId: string, formData: FormData): Promise<void> {
  const { accessToken } = await requireSession();
  await api.addCaseFlag(accessToken, caseId, {
    userId: String(formData.get("userId") ?? ""),
    type: formData.get("type") as CaseUserRelationType,
    reason: (formData.get("reason") as string) || undefined,
  });
  revalidatePath(`/cases/${caseId}`);
}

export async function removeCaseFlagAction(caseId: string, flagId: string): Promise<void> {
  const { accessToken } = await requireSession();
  await api.removeCaseFlag(accessToken, caseId, flagId);
  revalidatePath(`/cases/${caseId}`);
}

/** `BulkCaseActionResult`-shaped forms (bulk Assign/Escalate from the Cases queue page's new
 * selection UI): the backend tolerates a partial failure (one bad case id in a batch doesn't
 * fail the others), so these actions surface that honestly via `FormState`'s `error` field (a
 * human-readable "N of M ... — failed: ..." string) rather than treating any non-empty
 * `failed[]` as a hard error. A fully-empty `failed[]` returns `{}` (success, same as every
 * other action in this app). */
function summarizePartialFailure(total: number, failed: { caseId: string; reason: string }[]): FormState {
  if (failed.length === 0) return {};
  const succeededCount = total - failed.length;
  const reasons = failed.map((f) => f.reason).join("; ");
  return { error: `${succeededCount} of ${total} succeeded — ${failed.length} failed: ${reasons}` };
}

export async function bulkAssignCasesAction(caseIds: string[], _prevState: FormState, formData: FormData): Promise<FormState> {
  const { accessToken } = await requireSession();
  const teamId = String(formData.get("teamId") ?? "");
  let result;
  try {
    result = await api.bulkAssignCases(accessToken, caseIds, teamId);
  } catch (error) {
    return parseActionError(error);
  }
  revalidatePath("/cases");
  return summarizePartialFailure(caseIds.length, result.failed);
}

export async function bulkEscalateCasesAction(caseIds: string[], _prevState: FormState, formData: FormData): Promise<FormState> {
  const { accessToken } = await requireSession();
  const reason = String(formData.get("reason") ?? "");
  let result;
  try {
    result = await api.bulkEscalateCases(accessToken, caseIds, reason);
  } catch (error) {
    return parseActionError(error);
  }
  revalidatePath("/cases");
  return summarizePartialFailure(caseIds.length, result.failed);
}
