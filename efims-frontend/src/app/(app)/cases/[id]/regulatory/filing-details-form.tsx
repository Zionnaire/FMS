"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Trash2, Save, Check, FileText } from "lucide-react";
import { updateFilingDetailsAction } from "@/features/regulatory/actions";
import type { ObligationType, RegulatorNotificationFilingDetails, StrFilingDetails, StrSubject, StrTransaction } from "@/features/regulatory/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const EMPTY_STR: StrFilingDetails = {
  reportingInstitutionName: "",
  cbnInstitutionCode: "",
  complianceOfficerName: "",
  subjects: [],
  groundsOfSuspicion: "",
  transactions: [],
};

const EMPTY_NOTIFICATION: RegulatorNotificationFilingDetails = {
  reportingInstitutionName: "",
  incidentClassification: "",
  narrative: "",
  financialExposureNgn: "",
};

/** Real, structured filing capture for the two obligation types that have a genuine standard
 * shape — see `RegulatoryObligation.filingDetails`'s own doc comment in `schema.prisma` for what
 * this is and is NOT (no real NFIU goAML or CBN portal integration anywhere in this codebase).
 * Only rendered/editable while the obligation is still `PENDING`, mirroring the backend's own
 * guard in `RegulatoryService.updateFilingDetails` — once submitted, what was actually filed is
 * a fact of record. `caseDescriptionSeed` pre-fills the grounds-of-suspicion narrative on first
 * open only (never overwrites a draft the analyst has already started editing). */
export function FilingDetailsForm({
  caseId,
  obligationId,
  obligationType,
  initialFilingDetails,
  caseDescriptionSeed,
}: {
  caseId: string;
  obligationId: string;
  obligationType: ObligationType;
  initialFilingDetails: StrFilingDetails | RegulatorNotificationFilingDetails | null;
  caseDescriptionSeed: string;
}) {
  if (obligationType === "STR_SAR_FILING") {
    return (
      <StrForm
        caseId={caseId}
        obligationId={obligationId}
        hadInitialData={initialFilingDetails !== null}
        initial={(initialFilingDetails as StrFilingDetails | null) ?? { ...EMPTY_STR, groundsOfSuspicion: caseDescriptionSeed }}
      />
    );
  }
  if (obligationType === "REGULATOR_NOTIFICATION") {
    return (
      <NotificationForm
        caseId={caseId}
        obligationId={obligationId}
        hadInitialData={initialFilingDetails !== null}
        initial={(initialFilingDetails as RegulatorNotificationFilingDetails | null) ?? { ...EMPTY_NOTIFICATION, narrative: caseDescriptionSeed }}
      />
    );
  }
  return null;
}

/** Shown once this draft has been saved at least once this session (`saved`) OR already had
 * data from a prior session (`hadInitialData`) — either way there's something real to preview.
 * Rendered from local state, not a server-refetched prop, so it appears immediately after a
 * save with no page reload (see `updateFilingDetailsAction`'s own doc comment on why this form
 * deliberately doesn't trigger one). */
function SavedBadgeAndPreview({ saved, hadInitialData, caseId, obligationId }: { saved: boolean; hadInitialData: boolean; caseId: string; obligationId: string }) {
  return (
    <div className="flex items-center gap-3">
      {saved && (
        <span className="flex items-center gap-1 text-[11px] font-semibold text-tertiary">
          <Check size={12} strokeWidth={2.5} />
          Saved
        </span>
      )}
      {(saved || hadInitialData) && (
        <Link href={`/regulatory-preview/${caseId}/${obligationId}`} target="_blank" className="flex items-center gap-1 text-[11px] font-semibold text-secondary underline hover:text-on-surface">
          <FileText size={12} strokeWidth={2} />
          Preview filing
        </Link>
      )}
    </div>
  );
}

function StrForm({ caseId, obligationId, initial, hadInitialData }: { caseId: string; obligationId: string; initial: StrFilingDetails; hadInitialData: boolean }) {
  const [form, setForm] = useState<StrFilingDetails>(initial);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof StrFilingDetails>(key: K, value: StrFilingDetails[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  function updateSubject(i: number, patch: Partial<StrSubject>) {
    set("subjects", form.subjects.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function updateTransaction(i: number, patch: Partial<StrTransaction>) {
    set("transactions", form.transactions.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  }

  async function handleSave() {
    setPending(true);
    setError(null);
    const result = await updateFilingDetailsAction(caseId, obligationId, form);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSaved(true);
  }

  return (
    <div className="space-y-4 rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-4 text-xs">
      <p className="text-[11px] font-bold tracking-wide text-tertiary uppercase">STR/SAR filing details — reporting institution</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div>
          <Label className="text-[10px] text-on-surface-variant uppercase">Institution name</Label>
          <Input value={form.reportingInstitutionName} onChange={(e) => set("reportingInstitutionName", e.target.value)} />
        </div>
        <div>
          <Label className="text-[10px] text-on-surface-variant uppercase">CBN institution code</Label>
          <Input value={form.cbnInstitutionCode} onChange={(e) => set("cbnInstitutionCode", e.target.value)} />
        </div>
        <div>
          <Label className="text-[10px] text-on-surface-variant uppercase">Compliance officer</Label>
          <Input value={form.complianceOfficerName} onChange={(e) => set("complianceOfficerName", e.target.value)} />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-bold tracking-wide text-tertiary uppercase">Subjects of report</p>
          <Button type="button" variant="outline" size="sm" className="h-6 gap-1 px-2 text-[11px]" onClick={() => set("subjects", [...form.subjects, { name: "", idNumber: "", role: "" }])}>
            <Plus size={12} strokeWidth={2} />
            Add subject
          </Button>
        </div>
        {form.subjects.length === 0 && <p className="mt-1.5 text-on-surface-variant">No subjects added yet.</p>}
        <div className="mt-1.5 space-y-1.5">
          {form.subjects.map((s, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <Input placeholder="Full name" value={s.name} onChange={(e) => updateSubject(i, { name: e.target.value })} className="h-8 text-xs" />
              <Input placeholder="ID / BVN" value={s.idNumber} onChange={(e) => updateSubject(i, { idNumber: e.target.value })} className="h-8 text-xs" />
              <Input placeholder="Role" value={s.role} onChange={(e) => updateSubject(i, { role: e.target.value })} className="h-8 text-xs" />
              <button type="button" onClick={() => set("subjects", form.subjects.filter((_, idx) => idx !== i))} className="shrink-0 rounded p-1.5 text-on-surface-variant hover:bg-error-container hover:text-on-error-container" aria-label="Remove subject">
                <Trash2 size={14} strokeWidth={2} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <Label className="text-[11px] font-bold tracking-wide text-tertiary uppercase">Grounds of suspicion</Label>
        <Textarea value={form.groundsOfSuspicion} onChange={(e) => set("groundsOfSuspicion", e.target.value)} rows={4} className="mt-1" />
      </div>

      <div>
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-bold tracking-wide text-tertiary uppercase">Transaction schedule</p>
          <Button type="button" variant="outline" size="sm" className="h-6 gap-1 px-2 text-[11px]" onClick={() => set("transactions", [...form.transactions, { date: "", channel: "", amountNgn: "", beneficiary: "" }])}>
            <Plus size={12} strokeWidth={2} />
            Add transaction
          </Button>
        </div>
        {form.transactions.length === 0 && <p className="mt-1.5 text-on-surface-variant">No transactions added yet.</p>}
        <div className="mt-1.5 space-y-1.5">
          {form.transactions.map((t, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <Input type="date" value={t.date} onChange={(e) => updateTransaction(i, { date: e.target.value })} className="h-8 text-xs" />
              <Input placeholder="Channel" value={t.channel} onChange={(e) => updateTransaction(i, { channel: e.target.value })} className="h-8 text-xs" />
              <Input placeholder="Amount (NGN)" value={t.amountNgn} onChange={(e) => updateTransaction(i, { amountNgn: e.target.value })} className="h-8 text-xs" />
              <Input placeholder="Beneficiary" value={t.beneficiary} onChange={(e) => updateTransaction(i, { beneficiary: e.target.value })} className="h-8 text-xs" />
              <button type="button" onClick={() => set("transactions", form.transactions.filter((_, idx) => idx !== i))} className="shrink-0 rounded p-1.5 text-on-surface-variant hover:bg-error-container hover:text-on-error-container" aria-label="Remove transaction">
                <Trash2 size={14} strokeWidth={2} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {error && <p className="text-error">{error}</p>}
      <div className="flex items-center gap-2 border-t border-outline-variant pt-3">
        <Button type="button" size="sm" disabled={pending} onClick={handleSave} className="gap-1.5">
          <Save size={14} strokeWidth={2} />
          {pending ? "Saving…" : "Save filing details"}
        </Button>
        <SavedBadgeAndPreview saved={saved} hadInitialData={hadInitialData} caseId={caseId} obligationId={obligationId} />
      </div>
    </div>
  );
}

function NotificationForm({ caseId, obligationId, initial, hadInitialData }: { caseId: string; obligationId: string; initial: RegulatorNotificationFilingDetails; hadInitialData: boolean }) {
  const [form, setForm] = useState<RegulatorNotificationFilingDetails>(initial);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof RegulatorNotificationFilingDetails>(key: K, value: RegulatorNotificationFilingDetails[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  async function handleSave() {
    setPending(true);
    setError(null);
    const result = await updateFilingDetailsAction(caseId, obligationId, form);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSaved(true);
  }

  return (
    <div className="space-y-3 rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-4 text-xs">
      <p className="text-[11px] font-bold tracking-wide text-tertiary uppercase">Regulator notification details</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <Label className="text-[10px] text-on-surface-variant uppercase">Institution name</Label>
          <Input value={form.reportingInstitutionName} onChange={(e) => set("reportingInstitutionName", e.target.value)} />
        </div>
        <div>
          <Label className="text-[10px] text-on-surface-variant uppercase">Incident classification</Label>
          <Input value={form.incidentClassification} onChange={(e) => set("incidentClassification", e.target.value)} />
        </div>
      </div>
      <div>
        <Label className="text-[10px] text-on-surface-variant uppercase">Financial exposure (NGN)</Label>
        <Input type="number" min={0} value={form.financialExposureNgn} onChange={(e) => set("financialExposureNgn", e.target.value)} />
      </div>
      <div>
        <Label className="text-[11px] font-bold tracking-wide text-tertiary uppercase">Narrative</Label>
        <Textarea value={form.narrative} onChange={(e) => set("narrative", e.target.value)} rows={4} className="mt-1" />
      </div>
      {error && <p className="text-error">{error}</p>}
      <div className="flex items-center gap-2 border-t border-outline-variant pt-3">
        <Button type="button" size="sm" disabled={pending} onClick={handleSave} className="gap-1.5">
          <Save size={14} strokeWidth={2} />
          {pending ? "Saving…" : "Save filing details"}
        </Button>
        <SavedBadgeAndPreview saved={saved} hadInitialData={hadInitialData} caseId={caseId} obligationId={obligationId} />
      </div>
    </div>
  );
}
