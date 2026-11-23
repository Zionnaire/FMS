"use client";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SubmitButton } from "@/components/shell/submit-button";
import { ENTITY_CASE_LINK_ROLES } from "@/features/entities/types";

export function CaseLinkForm({
  cases,
  action,
}: {
  cases: { id: string; referenceCode: string; title: string }[];
  action: (formData: FormData) => void;
}) {
  if (cases.length === 0) {
    return <p className="text-xs text-on-surface-variant">No cases available to link — you need access to at least one case.</p>;
  }

  return (
    <form action={action} className="grid grid-cols-1 gap-2.5 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <div>
        <Label className="mb-1 text-[10px] font-bold uppercase">Case</Label>
        <Select name="caseId" required>
          <SelectTrigger className="w-full"><SelectValue placeholder="Choose a case…" /></SelectTrigger>
          <SelectContent>
            {cases.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.referenceCode} — {c.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="mb-1 text-[10px] font-bold uppercase">Role on this case</Label>
        <Select name="role" required defaultValue="SUBJECT">
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {ENTITY_CASE_LINK_ROLES.map((r) => (
              <SelectItem key={r} value={r}>{r}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <SubmitButton size="sm" variant="outline">Link case</SubmitButton>
    </form>
  );
}
