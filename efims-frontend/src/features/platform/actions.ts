"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ApiError } from "@/lib/backend-client";
import { clearPlatformSessionCookie, requirePlatformSession, setPlatformSessionCookie } from "./session";
import { createTenant, platformLogin, updateTenantStatus } from "./api";
import type { TenantStatus } from "./types";

const PlatformLoginSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Required"),
});

export interface PlatformLoginState {
  error?: string;
  fieldErrors?: Partial<Record<"email" | "password", string>>;
}

export async function platformLoginAction(_prevState: PlatformLoginState, formData: FormData): Promise<PlatformLoginState> {
  const parsed = PlatformLoginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) {
    const flat = parsed.error.flatten().fieldErrors;
    return { fieldErrors: { email: flat.email?.[0], password: flat.password?.[0] } };
  }

  try {
    const result = await platformLogin(parsed.data.email, parsed.data.password);
    await setPlatformSessionCookie(result.accessToken);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return { error: "Invalid email or password." };
    }
    return { error: "Unable to reach EFIMS Core right now. Try again shortly." };
  }

  redirect("/platform");
}

export async function platformLogoutAction(): Promise<void> {
  await clearPlatformSessionCookie();
  redirect("/platform/login");
}

const CreateTenantSchema = z.object({
  name: z.string().trim().min(2, "Required"),
  slug: z
    .string()
    .trim()
    .min(2, "Required")
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, digits, and hyphens only"),
  adminEmail: z.email("Enter a valid email address"),
  adminFullName: z.string().trim().min(2, "Required"),
  adminPassword: z.string().min(8, "Must be at least 8 characters"),
});

export interface CreateTenantState {
  error?: string;
  success?: boolean;
}

export async function createTenantAction(_prevState: CreateTenantState, formData: FormData): Promise<CreateTenantState> {
  const { accessToken } = await requirePlatformSession();

  const parsed = CreateTenantSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    adminEmail: formData.get("adminEmail"),
    adminFullName: formData.get("adminFullName"),
    adminPassword: formData.get("adminPassword"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    await createTenant(accessToken, parsed.data);
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message };
    }
    return { error: "Unable to reach EFIMS Core right now. Try again shortly." };
  }

  revalidatePath("/platform");
  return { success: true };
}

export async function updateTenantStatusAction(id: string, status: TenantStatus): Promise<void> {
  const { accessToken } = await requirePlatformSession();
  await updateTenantStatus(accessToken, id, status);
  revalidatePath("/platform");
}
