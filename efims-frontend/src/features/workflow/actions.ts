"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/features/auth/session";
import type { FormState } from "@/lib/form-state";
import { parseActionError } from "@/lib/form-state";
import type { ApprovalAction, SeverityBand } from "./types";
import * as api from "./api";

export async function startSlaClockAction(incidentId: string, formData: FormData): Promise<void> {
  const { accessToken } = await requireSession();
  await api.startSlaClock(accessToken, incidentId, String(formData.get("targetDeadline") ?? ""));
  revalidatePath(`/incidents/${incidentId}`);
}

export async function pauseSlaClockAction(incidentId: string, clockId: string, formData: FormData): Promise<void> {
  const { accessToken } = await requireSession();
  await api.pauseSlaClock(accessToken, incidentId, clockId, String(formData.get("reason") ?? ""));
  revalidatePath(`/incidents/${incidentId}`);
}

export async function resumeSlaClockAction(incidentId: string, clockId: string): Promise<void> {
  const { accessToken } = await requireSession();
  await api.resumeSlaClock(accessToken, incidentId, clockId);
  revalidatePath(`/incidents/${incidentId}`);
}

export async function stopSlaClockAction(incidentId: string, clockId: string): Promise<void> {
  const { accessToken } = await requireSession();
  await api.stopSlaClock(accessToken, incidentId, clockId);
  revalidatePath(`/incidents/${incidentId}`);
}

export async function requestApprovalAction(caseId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const { accessToken } = await requireSession();
  try {
    await api.requestApproval(accessToken, caseId, {
      action: formData.get("action") as ApprovalAction,
      severityBand: formData.get("severityBand") as SeverityBand,
      requestNotes: String(formData.get("requestNotes") ?? ""),
    });
  } catch (error) {
    return parseActionError(error);
  }
  revalidatePath(`/cases/${caseId}/approvals`);
  return {};
}

/** Most likely error here: "The requester cannot decide their own approval request" —
 * `ApprovalService.decide`'s segregation-of-duties rule. Shown inline rather than falling through
 * to the shared boundary, since a single-admin-per-tenant dev setup makes this an easy mistake to
 * actually hit, not just a theoretical edge case. */
export async function decideApprovalAction(caseId: string, approvalId: string, approved: boolean, _prevState: FormState, formData: FormData): Promise<FormState> {
  const { accessToken } = await requireSession();
  try {
    await api.decideApproval(accessToken, caseId, approvalId, {
      approved,
      decisionNotes: (formData.get("decisionNotes") as string) || undefined,
    });
  } catch (error) {
    return parseActionError(error);
  }
  revalidatePath(`/cases/${caseId}/approvals`);
  return {};
}
