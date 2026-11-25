"use client";

import { useActionState } from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/shell/submit-button";
import type { FormState } from "@/lib/form-state";

const initialState: FormState = {};

/** The honest substitute for the mockup's fabricated live OFAC/UN/EU/NFIU/Interpol sanctions
 * sync — a manual, audited flag with a required reason (see Entity's own schema.prisma doc
 * comment and EntitiesService.setWatchlist). `useActionState` so a backend rejection (e.g. a
 * whitespace-only reason) shows inline instead of crashing the page. */
export function WatchlistForm({
  watchlisted,
  reason,
  action,
}: {
  watchlisted: boolean;
  reason: string | null;
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(action, initialState);

  if (watchlisted) {
    return (
      <form action={formAction} className="space-y-2">
        <input type="hidden" name="watchlisted" value="false" />
        <p className="flex items-center gap-1.5 text-xs text-error">
          <ShieldAlert size={13} strokeWidth={2} />
          Watchlisted: {reason}
        </p>
        {state.error && <p className="text-xs font-medium text-error">{state.error}</p>}
        <SubmitButton size="sm" variant="outline">Clear watchlist flag</SubmitButton>
      </form>
    );
  }

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="watchlisted" value="true" />
      <div>
        <Label className="mb-1 text-[10px] font-bold uppercase">Reason (required to flag)</Label>
        <Textarea name="reason" rows={2} placeholder="e.g. Matches internal fraud-ring pattern from case CASE-2026-0007" required />
      </div>
      {state.error && <p className="text-xs font-medium text-error">{state.error}</p>}
      <SubmitButton size="sm" variant="outline">
        <ShieldCheck size={13} strokeWidth={2} className="mr-1" />
        Flag as watchlisted
      </SubmitButton>
    </form>
  );
}
