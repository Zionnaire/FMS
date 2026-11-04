"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/features/auth/session";
import type { Compartment, Role } from "@/features/auth/types";
import type { FormState } from "@/lib/form-state";
import { parseActionError } from "@/lib/form-state";
import type { AccessChangeType } from "./types";
import * as api from "./api";

export async function createUserAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const { accessToken } = await requireSession();
  const compartments = formData.getAll("compartments") as Compartment[];

  let created;
  try {
    created = await api.createUser(accessToken, {
      email: String(formData.get("email") ?? ""),
      fullName: String(formData.get("fullName") ?? ""),
      role: formData.get("role") as Role,
      clearanceLevel: Number(formData.get("clearanceLevel") ?? 1),
      compartments: compartments.length ? compartments : undefined,
      temporaryPassword: String(formData.get("temporaryPassword") ?? ""),
    });
  } catch (error) {
    return parseActionError(error);
  }

  revalidatePath("/users");
  redirect(`/users/${created.id}`);
}

export async function requestAccessChangeAction(userId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const { accessToken } = await requireSession();

  try {
    await api.requestAccessChange(accessToken, userId, {
      changeType: formData.get("changeType") as AccessChangeType,
      role: (formData.get("role") as Role) || undefined,
      compartment: (formData.get("compartment") as Compartment) || undefined,
      expiresAt: (formData.get("expiresAt") as string) || undefined,
      requestNotes: String(formData.get("requestNotes") ?? ""),
    });
  } catch (error) {
    return parseActionError(error);
  }

  revalidatePath(`/users/${userId}`);
  revalidatePath("/users/access-change-requests");
  return {};
}

/** Mirrors `workflow/actions.ts`'s `decideApprovalAction` shape exactly — same inline
 * `action={async (fd) => { "use server"; ... }}` call site pattern used on the approvals tab. */
export async function decideAccessChangeAction(requestId: string, userId: string, approved: boolean, formData: FormData): Promise<void> {
  const { accessToken } = await requireSession();
  await api.decideAccessChange(accessToken, requestId, {
    approved,
    decisionNotes: (formData.get("decisionNotes") as string) || undefined,
  });
  revalidatePath(`/users/${userId}`);
  revalidatePath("/users/access-change-requests");
}
