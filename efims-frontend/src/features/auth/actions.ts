"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { ApiError, backendFetch } from "@/lib/backend-client";
import { clearSessionCookies, getRefreshToken, setSessionCookies } from "./session";
import type { LoginResult } from "./types";

const LoginSchema = z.object({
  tenantSlug: z
    .string()
    .trim()
    .min(1, "Required")
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, digits, and hyphens only"),
  email: z.email("Enter a valid email address"),
  password: z.string().min(8, "Must be at least 8 characters"),
});

export interface LoginState {
  error?: string;
  fieldErrors?: Partial<Record<"tenantSlug" | "email" | "password", string>>;
}

export async function loginAction(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = LoginSchema.safeParse({
    tenantSlug: formData.get("tenantSlug"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    const flat = parsed.error.flatten().fieldErrors;
    return {
      fieldErrors: {
        tenantSlug: flat.tenantSlug?.[0],
        email: flat.email?.[0],
        password: flat.password?.[0],
      },
    };
  }

  try {
    const result = await backendFetch<LoginResult>("/auth/login", {
      method: "POST",
      body: parsed.data,
      skipAuth: true,
    });
    await setSessionCookies(result.accessToken, result.refreshToken);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 400)) {
      return { error: "Invalid tenant, email, or password." };
    }
    return { error: "Unable to reach EFIMS Core right now. Try again shortly." };
  }

  redirect("/");
}

export async function logoutAction(): Promise<void> {
  const refreshToken = await getRefreshToken();
  if (refreshToken) {
    try {
      await backendFetch("/auth/logout", { method: "POST", body: { refreshToken }, skipAuth: true });
    } catch {
      // Revocation is best-effort on logout — the cookie is cleared regardless below, so the
      // browser loses its credential either way; a failed revoke just means that specific
      // refresh token stays valid server-side until it naturally expires (7d).
    }
  }
  await clearSessionCookies();
  redirect("/login");
}
