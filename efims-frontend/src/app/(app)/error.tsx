"use client";

import { AlertCircle } from "lucide-react";

/**
 * Catches errors thrown by any Server Action or Server Component under `(app)/` — required to
 * be a Client Component per Next.js's own `error.tsx` convention. Without this, an `ApiError`
 * from the backend (e.g. a 400 validation failure) bubbled up as an uncaught exception and
 * crashed the whole page with Next.js's raw dev overlay, rather than a graceful in-app message
 * — found live while verifying this build's forms in a browser, not a hypothetical concern.
 *
 * This is deliberately a single shared boundary, not per-form inline validation state, given how
 * many Server-Action forms this app now has — every one of them benefits from this at once. A
 * follow-up could add `useActionState`-based inline errors to the highest-traffic forms later
 * without needing to touch this file.
 *
 * `IS_TRANSIENT_TRANSPORT_ERROR` catches a second, distinct failure class found live 2026-11-24:
 * "An unexpected response was received from the server." is Next.js's OWN internal message
 * (`node_modules/next/dist/client/components/router-reducer/reducers/server-action-reducer.js`),
 * thrown when a Server Action's HTTP response itself fails to parse as a valid RSC payload — e.g.
 * Render's free tier returning a 502/timeout page mid-request during a cold start, upstream of
 * this app's own `backendFetch`/`ApiError` handling entirely, so no `try/catch` in `actions.ts`
 * can intercept it. Blindly auto-retrying is NOT safe here in general (a lost response after a
 * non-idempotent write, e.g. signal/case creation, could double-submit on retry — the same
 * reasoning `withColdStartRetry` in `features/auth/actions.ts` restricts itself to the safely-
 * retryable login/MFA-verify calls only). Instead, this shows an honest, specific warning telling
 * the user to check before resubmitting, rather than Next's generic (and more alarming) text.
 */
function isTransientTransportError(message: string): boolean {
  return /unexpected response was received from the server/i.test(message);
}

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const transient = isTransientTransportError(error.message);

  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-error/30 bg-error-container/20 p-10 text-center">
      <AlertCircle size={40} strokeWidth={1.75} className="text-error" />
      <div>
        <p className="text-sm font-semibold text-on-error-container">
          {transient ? "Connection interrupted." : "Something went wrong."}
        </p>
        <p className="mt-1 max-w-md text-xs text-on-error-container/80">
          {transient
            ? "The server didn't respond in time. This is usually a brief hosting hiccup, not a lost action. If you just submitted something, check whether it actually went through before submitting again."
            : error.message || "An unexpected error occurred."}
        </p>
      </div>
      <button
        onClick={reset}
        className="rounded-lg border border-error/40 bg-surface-container-lowest px-4 py-2 text-xs font-semibold text-on-surface transition-colors hover:bg-surface-container-low"
      >
        Try again
      </button>
    </div>
  );
}
