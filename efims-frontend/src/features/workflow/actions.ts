"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/features/auth/session";
import type { FormState } from "@/lib/form-state";
import { parseActionError } from "@/lib/form-state";
import type { ApprovalAction, SeverityBand } from "./types";
import * as api from "./api";

/** Returns `FormState` and catches `ApiError` via `parseActionError`, same as every other action
 * in this file — found live 2026-11-24 that this one (and its 3 siblings below) didn't, so ANY
 * backend error (a validation failure, a transient 5xx, an access denial) crashed the whole page
 * through the shared `(app)/error.tsx` boundary instead of showing an inline message, the exact
 * "Minified React error #441 — An error occurred in the Server Components render" a user hit
 * starting a clock. Call sites moved into a dedicated Client Component (`sla-clock-panel.tsx`)
 * using `useActionState`, mirroring `RequestApprovalForm`'s established pattern. */
export async function startSlaClockAction(incidentId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const { accessToken } = await requireSession();
  try {
    await api.startSlaClock(accessToken, incidentId, String(formData.get("targetDeadline") ?? ""));
  } catch (error) {
    return parseActionError(error);
  }
  revalidatePath(`/incidents/${incidentId}`);
  return {};
}

export async function pauseSlaClockAction(incidentId: string, clockId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const { accessToken } = await requireSession();
  try {
    await api.pauseSlaClock(accessToken, incidentId, clockId, String(formData.get("reason") ?? ""));
  } catch (error) {
    return parseActionError(error);
  }
  revalidatePath(`/incidents/${incidentId}`);
  return {};
}

export async function resumeSlaClockAction(incidentId: string, clockId: string, _prevState: FormState): Promise<FormState> {
  const { accessToken } = await requireSession();
  try {
    await api.resumeSlaClock(accessToken, incidentId, clockId);
  } catch (error) {
    return parseActionError(error);
  }
  revalidatePath(`/incidents/${incidentId}`);
  return {};
}

export async function stopSlaClockAction(incidentId: string, clockId: string, _prevState: FormState): Promise<FormState> {
  const { accessToken } = await requireSession();
  try {
    await api.stopSlaClock(accessToken, incidentId, clockId);
  } catch (error) {
    return parseActionError(error);
  }
  revalidatePath(`/incidents/${incidentId}`);
  return {};
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
