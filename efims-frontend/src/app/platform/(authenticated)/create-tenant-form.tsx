"use client";

import { useActionState } from "react";
import { createTenantAction, type CreateTenantState } from "@/features/platform/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: CreateTenantState = {};

export function CreateTenantForm() {
  const [state, formAction, pending] = useActionState(createTenantAction, initialState);

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="name" className="mb-1 text-[11px] font-semibold text-outline uppercase">Bank name</Label>
          <Input id="name" name="name" placeholder="Bank 2" required />
        </div>
        <div>
          <Label htmlFor="slug" className="mb-1 text-[11px] font-semibold text-outline uppercase">Slug</Label>
          <Input id="slug" name="slug" placeholder="bank-2" pattern="[a-z0-9\-]+" required />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="adminFullName" className="mb-1 text-[11px] font-semibold text-outline uppercase">First admin name</Label>
          <Input id="adminFullName" name="adminFullName" placeholder="Jane Admin" required />
        </div>
        <div>
          <Label htmlFor="adminEmail" className="mb-1 text-[11px] font-semibold text-outline uppercase">First admin email</Label>
          <Input id="adminEmail" name="adminEmail" type="email" placeholder="admin@bank2.efims.local" required />
        </div>
      </div>
      <div>
        <Label htmlFor="adminPassword" className="mb-1 text-[11px] font-semibold text-outline uppercase">Temporary password</Label>
        <Input id="adminPassword" name="adminPassword" type="password" minLength={8} required />
      </div>

      {state.error && (
        <p className="rounded-lg border border-error/30 bg-error-container/40 px-3 py-2 text-xs font-medium text-on-error-container">{state.error}</p>
      )}
      {state.success && (
        <p className="rounded-lg border border-tertiary/30 bg-tertiary-fixed/30 px-3 py-2 text-xs font-medium text-on-tertiary-fixed-variant">
          Tenant provisioned — it now appears in the list below.
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-primary px-5 py-2.5 text-xs font-semibold text-on-primary shadow-card transition-all hover:bg-primary-container disabled:opacity-60"
      >
        {pending ? "Provisioning…" : "Provision tenant"}
      </button>
    </form>
  );
}
