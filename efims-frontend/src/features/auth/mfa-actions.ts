"use server";

import { revalidatePath } from "next/cache";
import { ApiError, backendFetch } from "@/lib/backend-client";
import { requireSession } from "./session";

/** The three mutating steps of self-service MFA management — all act on the CALLER's own
 * account (see `AuthController`'s own doc comment: no "admin enrolls someone else" path exists
 * or should). Each takes a plain argument rather than `FormData`/`useActionState`'s
 * `(prevState, formData)` shape because these are triggered by a button click inside an
 * already-rendered panel, not a traditional form submit — Next.js Server Actions can be called
 * directly like any other async function from a Client Component. */

export interface EnrollStartResult {
  secret: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
}

export async function startMfaEnrollmentAction(): Promise<{ data?: EnrollStartResult; error?: string }> {
  const { accessToken } = await requireSession();
  try {
    const data = await backendFetch<EnrollStartResult>("/auth/mfa/enroll/start", { method: "POST", accessToken });
    return { data };
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Unable to start enrollment right now." };
  }
}

export async function confirmMfaEnrollmentAction(code: string): Promise<{ backupCodes?: string[]; error?: string }> {
  const { accessToken } = await requireSession();
  try {
    const data = await backendFetch<{ backupCodes: string[] }>("/auth/mfa/enroll/confirm", { method: "POST", body: { code }, accessToken });
    revalidatePath("/settings/security");
    return { backupCodes: data.backupCodes };
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Invalid code — check your authenticator app and try again." };
  }
}

export async function disableMfaAction(password: string): Promise<{ success?: true; error?: string }> {
  const { accessToken } = await requireSession();
  try {
    await backendFetch("/auth/mfa/disable", { method: "POST", body: { password }, accessToken });
    revalidatePath("/settings/security");
    return { success: true };
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Unable to disable MFA right now." };
  }
}
