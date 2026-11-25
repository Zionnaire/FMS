"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { ApiError, backendFetch } from "@/lib/backend-client";
import { clearSessionCookies, getRefreshToken, setSessionCookies } from "./session";
import type { LoginResult, LoginSuccessResult } from "./types";

const LoginSchema = z.object({
  tenantSlug: z
    .string()
    .trim()
    .min(1, "Required")
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, digits, and hyphens only"),
  email: z.email("Enter a valid email address"),
  password: z.string().min(8, "Must be at least 8 characters"),
});

const VerifyMfaSchema = z.object({
  mfaChallengeToken: z.string().min(10),
  code: z.string().trim().min(6, "Enter your 6-digit code or a backup code").max(20),
});

/** Render's and Neon's free tiers both suspend when idle (see `.github/workflows/keep-alive.yml`'s
 * own doc comment) — a cold first request can take up to ~50-60s to come back, confirmed live. A
 * ApiError with a real 401/400 means the (warm) backend genuinely rejected the credentials/code —
 * never retry that. Anything else (a network failure, a gateway timeout, a 502/503/504 while the
 * service is mid-boot) is retried a few times with backoff, since a retry a few seconds later
 * typically lands on an already-warm (or now-warmed-up) instance — confirmed live: a cold
 * `/health/ready` took 47-57s on its own, but the very next request right after was 4.2s. */
async function withColdStartRetry<T>(fn: () => Promise<T>): Promise<T> {
  const backoffMs = [5000, 10000, 15000];
  let lastError: unknown;
  for (let attempt = 0; attempt <= backoffMs.length; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 400)) {
        throw error;
      }
      lastError = error;
      if (attempt < backoffMs.length) {
        await new Promise((resolve) => setTimeout(resolve, backoffMs[attempt]));
      }
    }
  }
  throw lastError;
}

export interface LoginState {
  error?: string;
  fieldErrors?: Partial<Record<"tenantSlug" | "email" | "password" | "code", string>>;
  /** Set only when the previous submit returned `mfaRequired` — the form re-renders as the MFA
   * code step and carries this back as a hidden field on the next submit, which is how
   * `loginAction` tells the two steps apart (no separate action/endpoint needed on this side). */
  mfaChallengeToken?: string;
}

export async function loginAction(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const existingChallenge = formData.get("mfaChallengeToken");
  if (typeof existingChallenge === "string" && existingChallenge) {
    return verifyMfaStep(existingChallenge, formData);
  }

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

  let result: LoginResult;
  try {
    result = await withColdStartRetry(() =>
      backendFetch<LoginResult>("/auth/login", {
        method: "POST",
        body: parsed.data,
        skipAuth: true,
      }),
    );
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 400)) {
      return { error: "Invalid tenant, email, or password." };
    }
    return { error: "The server is waking up from being idle. This can take up to a minute. Please try again." };
  }

  if ("mfaRequired" in result) {
    return { mfaChallengeToken: result.mfaChallengeToken };
  }

  await setSessionCookies(result.accessToken, result.refreshToken);
  redirect("/");
}

async function verifyMfaStep(mfaChallengeToken: string, formData: FormData): Promise<LoginState> {
  const parsed = VerifyMfaSchema.safeParse({ mfaChallengeToken, code: formData.get("code") });
  if (!parsed.success) {
    return { mfaChallengeToken, fieldErrors: { code: parsed.error.flatten().fieldErrors.code?.[0] } };
  }

  let result: LoginSuccessResult;
  try {
    result = await withColdStartRetry(() =>
      backendFetch<LoginSuccessResult>("/auth/mfa/verify", {
        method: "POST",
        body: parsed.data,
        skipAuth: true,
      }),
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      // The challenge token itself may also have expired (5 min) — same message either way,
      // same "don't help an attacker distinguish failure reasons" posture as the password step.
      return { mfaChallengeToken, error: "Invalid or expired code. If it's been a few minutes, start over." };
    }
    return { mfaChallengeToken, error: "The server is waking up from being idle. This can take up to a minute. Please try again." };
  }

  await setSessionCookies(result.accessToken, result.refreshToken);
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
