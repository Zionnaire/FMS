"use client";

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
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-error/30 bg-error-container/20 p-10 text-center">
      <span className="material-symbols-outlined text-4xl text-error">error</span>
      <div>
        <p className="text-sm font-semibold text-on-error-container">Something went wrong.</p>
        <p className="mt-1 max-w-md text-xs text-on-error-container/80">{error.message || "An unexpected error occurred."}</p>
      </div>
      <button
        onClick={reset}
        className="rounded-xl border border-error/40 bg-surface-container-lowest px-4 py-2 text-xs font-semibold text-on-surface transition-colors hover:bg-surface-container-low"
      >
        Try again
      </button>
    </div>
  );
}
