"use client";

import { useState, useTransition } from "react";
import { verifyEvidenceAction, type VerifyEvidenceActionResult } from "@/features/evidence/actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function VerifyForm({ caseId, evidenceId }: { caseId: string; evidenceId: string }) {
  const [result, setResult] = useState<VerifyEvidenceActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(formData: FormData) => {
        startTransition(async () => {
          const r = await verifyEvidenceAction(caseId, evidenceId, formData);
          setResult(r);
        });
      }}
      className="flex items-center gap-2"
    >
      <Input name="content" placeholder="Re-supply original content to verify" className="h-8 text-xs" required />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>{pending ? "Verifying…" : "Verify hash"}</Button>
      {result && (
        <span className={`text-xs font-semibold ${result.intact ? "text-tertiary" : "text-error"}`}>
          {result.intact ? "Intact" : "Mismatch"}
        </span>
      )}
    </form>
  );
}
