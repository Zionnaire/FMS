"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "@/features/auth/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

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
