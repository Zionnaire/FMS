"use client";

import { ShieldAlert, ShieldCheck } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/shell/submit-button";

/** The honest substitute for the mockup's fabricated live OFAC/UN/EU/NFIU/Interpol sanctions
 * sync — a manual, audited flag with a required reason (see Entity's own schema.prisma doc
 * comment and EntitiesService.setWatchlist). */
export function WatchlistForm({ watchlisted, reason, action }: { watchlisted: boolean; reason: string | null; action: (formData: FormData) => void }) {
  if (watchlisted) {
    return (
      <form action={action} className="space-y-2">
        <input type="hidden" name="watchlisted" value="false" />
        <p className="flex items-center gap-1.5 text-xs text-error">
          <ShieldAlert size={13} strokeWidth={2} />
          Watchlisted — {reason}
        </p>
        <SubmitButton size="sm" variant="outline">Clear watchlist flag</SubmitButton>
      </form>
    );
  }

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="watchlisted" value="true" />
      <div>
        <Label className="mb-1 text-[10px] font-bold uppercase">Reason (required to flag)</Label>
        <Textarea name="reason" rows={2} placeholder="e.g. Matches internal fraud-ring pattern from case CASE-2026-0007" required />
      </div>
      <SubmitButton size="sm" variant="outline">
        <ShieldCheck size={13} strokeWidth={2} className="mr-1" />
        Flag as watchlisted
      </SubmitButton>
    </form>
  );
}
