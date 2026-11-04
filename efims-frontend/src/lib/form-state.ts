import "server-only";
import { ApiError } from "./backend-client";

/**
 * Shared `useActionState` result shape for every data-entry form. Client Components only ever
 * import this as a type (`import type { FormState } from "@/lib/form-state"`, same pattern already
 * used for `CreateTenantState` from the `"use server"` actions file it lives next to) — the actual
 * `server-only` import above never reaches a client bundle because a type-only import is erased at
 * compile time, exactly like a Client Component already imports a Server Action function from an
 * `actions.ts` file without pulling its server-only internals along.
 */
export interface FormState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

/**
 * Converts a thrown `ApiError` into a `FormState` an action can return instead of letting it
 * propagate to the shared `(app)/error.tsx` boundary. Only `ApiError` is handled — anything else
 * (a genuine programming error) is rethrown so it still surfaces loudly via that boundary rather
 * than being silently swallowed here.
 *
 * The backend's `ValidationPipe` (`main.ts`) has no custom `exceptionFactory`, so class-validator's
 * default messages are used, which are always `"<property> <constraint text>"` (e.g.
 * `"clearanceLevel must not be greater than 4"`). Splitting on the first space recovers the field
 * name without needing any backend change. A single-string `message` (most domain-rule 400/403/409s,
 * e.g. "Unknown incident category...") has no field to attach to, so it becomes the flat `error`.
 */
export function parseActionError(error: unknown): FormState {
  if (!(error instanceof ApiError)) {
    throw error;
  }

  const details = error.details;
  const rawMessage = details && typeof details === "object" && "message" in details ? (details as { message: unknown }).message : undefined;

  if (Array.isArray(rawMessage) && rawMessage.every((m) => typeof m === "string")) {
    const fieldErrors: Record<string, string> = {};
    for (const entry of rawMessage as string[]) {
      const spaceIndex = entry.indexOf(" ");
      if (spaceIndex > 0) {
        const field = entry.slice(0, spaceIndex);
        // First message wins per field — later constraint violations on the same field are still
        // present in the flat `error` fallback below.
        if (!(field in fieldErrors)) fieldErrors[field] = entry;
      }
    }
    return { error: (rawMessage as string[]).join(", "), fieldErrors };
  }

  return { error: error.message };
}
