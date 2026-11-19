"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/features/auth/session";
import type { FormState } from "@/lib/form-state";
import { parseActionError } from "@/lib/form-state";
import type { FilingDetails, ObligationType } from "./types";
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

/** Unlike the other actions here, this is called directly from a Client Component (the
 * structured STR/regulator-notification filing form manages its own add/remove-row local state,
 * so there's no plain `FormData` to parse) rather than via `useActionState` — same pattern as
 * the MFA enrollment actions.
 *
 * Deliberately does NOT call `revalidatePath` — found live: an analyst can save a filing-details
 * draft many times while still actively typing, and revalidating the whole page on every save
 * forces a fresh Server Component fetch that can race the write it just caused, visibly (if
 * briefly) blanking the form back to its pre-edit state before the refetch catches up. The
 * form's own local state is already the live source of truth for what's on screen — the only
 * other thing on the page that depends on `filingDetails` being saved is the "Preview filing"
 * link, which the form now renders itself (from its own just-saved local state) once `saved` is
 * true, so nothing here actually needed the whole page to re-render. The obligation list still
 * picks up the latest `filingDetails` the next time this route is genuinely re-fetched (a real
 * navigation, not this draft-save). */
export async function updateFilingDetailsAction(caseId: string, obligationId: string, filingDetails: FilingDetails): Promise<{ success?: true; error?: string }> {
  const { accessToken } = await requireSession();
  try {
    await api.updateFilingDetails(accessToken, caseId, obligationId, filingDetails);
  } catch (error) {
    return parseActionError(error);
  }
  return { success: true };
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
