"use client";

import { useActionState } from "react";
import { ShieldCheck } from "lucide-react";
import { loginAction, type LoginState } from "@/features/auth/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  if (state.mfaChallengeToken) {
    return <MfaStep state={state} formAction={formAction} pending={pending} />;
  }

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <Label htmlFor="tenantSlug" className="mb-1.5 text-xs font-bold uppercase tracking-wider text-on-surface-variant">
          Tenant
        </Label>
        <Input id="tenantSlug" name="tenantSlug" placeholder="bank-1" defaultValue="bank-1" autoComplete="organization" />
        {state.fieldErrors?.tenantSlug && <p className="mt-1 text-xs text-error">{state.fieldErrors.tenantSlug}</p>}
      </div>

      <div>
        <Label htmlFor="email" className="mb-1.5 text-xs font-bold uppercase tracking-wider text-on-surface-variant">
          Email
        </Label>
        <Input id="email" name="email" type="email" placeholder="you@bank1.efims.local" autoComplete="username" />
        {state.fieldErrors?.email && <p className="mt-1 text-xs text-error">{state.fieldErrors.email}</p>}
      </div>

      <div>
        <Label htmlFor="password" className="mb-1.5 text-xs font-bold uppercase tracking-wider text-on-surface-variant">
          Password
        </Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" />
        {state.fieldErrors?.password && <p className="mt-1 text-xs text-error">{state.fieldErrors.password}</p>}
      </div>

      {state.error && (
        <p className="rounded-lg border border-error/30 bg-error-container/40 px-3 py-2 text-xs font-medium text-on-error-container">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-on-primary shadow-md transition-colors hover:bg-primary/90 disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

/** Second step of a login for an MFA-enrolled account — `mfaChallengeToken` travels as a hidden
 * field so `loginAction` can tell this submit apart from a fresh password attempt (see that
 * action's own doc comment); nothing about the password step re-renders here. "Start over"
 * is a plain navigation (not a form action) — it just remounts this component with fresh state,
 * same as refreshing the page, since there's no server-side "cancel" for an unused challenge
 * token beyond letting its 5-minute TTL expire. */
function MfaStep({ state, formAction, pending }: { state: LoginState; formAction: (formData: FormData) => void; pending: boolean }) {
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="mfaChallengeToken" value={state.mfaChallengeToken} />
      <div className="flex items-center gap-2 rounded-lg border border-tertiary/30 bg-tertiary-container/20 px-3 py-2.5 text-xs text-on-surface">
        <ShieldCheck size={16} strokeWidth={2} className="shrink-0 text-tertiary" />
        <span>Enter the 6-digit code from your authenticator app, or one of your backup codes.</span>
      </div>

      <div>
        <Label htmlFor="code" className="mb-1.5 text-xs font-bold uppercase tracking-wider text-on-surface-variant">
          Verification code
        </Label>
        <Input id="code" name="code" placeholder="123456" autoComplete="one-time-code" autoFocus maxLength={20} />
        {state.fieldErrors?.code && <p className="mt-1 text-xs text-error">{state.fieldErrors.code}</p>}
      </div>

      {state.error && (
        <p className="rounded-lg border border-error/30 bg-error-container/40 px-3 py-2 text-xs font-medium text-on-error-container">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-on-primary shadow-md transition-colors hover:bg-primary/90 disabled:opacity-60"
      >
        {pending ? "Verifying…" : "Verify"}
      </button>
      <a href="/login" className="block text-center text-xs text-on-surface-variant underline hover:text-on-surface">
        Start over
      </a>
    </form>
  );
}
