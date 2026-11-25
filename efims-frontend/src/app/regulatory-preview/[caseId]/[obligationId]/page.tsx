import { notFound } from "next/navigation";
import { requireSession } from "@/features/auth/session";
import { getCase } from "@/features/cases/api";
import { getObligation } from "@/features/regulatory/api";
import type { RegulatorNotificationFilingDetails, StrFilingDetails } from "@/features/regulatory/types";
import { PrintButton } from "../../print-button";

/** A real, printable filing document — deliberately outside the `(app)` route group so it
 * renders with no sidenav/topnav chrome, just the document itself, since this page exists to be
 * printed or saved as a PDF and handed to a regulator through whatever real channel that
 * regulator actually provides. There is no "Submit"/"Transmit" button anywhere on this page —
 * no real NFIU goAML or CBN portal integration exists in this codebase (see
 * `RegulatoryObligation.filingDetails`'s own doc comment in `schema.prisma`). Still goes through
 * `requireSession()` — a clean layout is not a weaker authorization boundary. */
export default async function RegulatoryFilingPreviewPage({ params }: { params: Promise<{ caseId: string; obligationId: string }> }) {
  const { caseId, obligationId } = await params;
  const { accessToken } = await requireSession();
  const [caseRecord, obligation] = await Promise.all([getCase(accessToken, caseId), getObligation(accessToken, caseId, obligationId)]);

  if (!obligation.filingDetails) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 text-sm text-on-surface print:p-0">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <p className="text-xs text-on-surface-variant">
          This is a draft preview of an unsubmitted filing for case <strong>{caseRecord.referenceCode}</strong>. It is not transmitted anywhere automatically.
        </p>
        <PrintButton />
      </div>

      <div className="rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-8 shadow-card print:border-none print:p-0 print:shadow-none">
        {obligation.obligationType === "STR_SAR_FILING" ? (
          <StrDocument filing={obligation.filingDetails as StrFilingDetails} caseRef={caseRecord.referenceCode} caseTitle={caseRecord.title} />
        ) : (
          <NotificationDocument filing={obligation.filingDetails as RegulatorNotificationFilingDetails} caseRef={caseRecord.referenceCode} caseTitle={caseRecord.title} />
        )}

        <p className="mt-10 border-t border-outline-variant/40 pt-4 text-[10px] text-on-surface-variant">
          Draft prepared in EFIMS from case {caseRecord.referenceCode}, not a confirmation of filing. Generated {new Date().toLocaleString()}.
        </p>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-bold tracking-wider text-on-surface-variant uppercase">{label}</dt>
      <dd className="text-sm text-on-surface">{value || "—"}</dd>
    </div>
  );
}

function StrDocument({ filing, caseRef, caseTitle }: { filing: StrFilingDetails; caseRef: string; caseTitle: string }) {
  return (
    <div className="space-y-6 font-mono text-sm">
      <div className="text-center">
        <p className="text-xs font-bold tracking-widest text-on-surface-variant uppercase">Suspicious Transaction Report</p>
        <h1 className="mt-1 text-xl font-bold text-on-surface">Draft: {caseRef}</h1>
        <p className="mt-0.5 text-xs text-on-surface-variant">{caseTitle}</p>
      </div>

      <section>
        <h2 className="mb-2 text-xs font-bold tracking-wider text-tertiary uppercase">Section A: Reporting institution</h2>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Institution name" value={filing.reportingInstitutionName} />
          <Field label="CBN institution code" value={filing.cbnInstitutionCode} />
          <Field label="Compliance officer" value={filing.complianceOfficerName} />
        </dl>
      </section>

      <section>
        <h2 className="mb-2 text-xs font-bold tracking-wider text-tertiary uppercase">Section B: Subject(s) of report</h2>
        {filing.subjects.length === 0 ? (
          <p className="text-on-surface-variant">No subjects recorded.</p>
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-outline-variant/60 text-left text-on-surface-variant">
                <th className="py-1 pr-2 font-semibold">Name</th>
                <th className="py-1 pr-2 font-semibold">ID / BVN</th>
                <th className="py-1 font-semibold">Role</th>
              </tr>
            </thead>
            <tbody>
              {filing.subjects.map((s, i) => (
                <tr key={i} className="border-b border-outline-variant/30">
                  <td className="py-1 pr-2">{s.name}</td>
                  <td className="py-1 pr-2">{s.idNumber}</td>
                  <td className="py-1">{s.role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-xs font-bold tracking-wider text-tertiary uppercase">Section C: Grounds of suspicion</h2>
        <p className="whitespace-pre-wrap text-on-surface">{filing.groundsOfSuspicion || "—"}</p>
      </section>

      <section>
        <h2 className="mb-2 text-xs font-bold tracking-wider text-tertiary uppercase">Section D: Transaction schedule</h2>
        {filing.transactions.length === 0 ? (
          <p className="text-on-surface-variant">No transactions recorded.</p>
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-outline-variant/60 text-left text-on-surface-variant">
                <th className="py-1 pr-2 font-semibold">Date</th>
                <th className="py-1 pr-2 font-semibold">Channel</th>
                <th className="py-1 pr-2 font-semibold">Amount (NGN)</th>
                <th className="py-1 font-semibold">Beneficiary</th>
              </tr>
            </thead>
            <tbody>
              {filing.transactions.map((t, i) => (
                <tr key={i} className="border-b border-outline-variant/30">
                  <td className="py-1 pr-2">{t.date}</td>
                  <td className="py-1 pr-2">{t.channel}</td>
                  <td className="py-1 pr-2">{t.amountNgn}</td>
                  <td className="py-1">{t.beneficiary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function NotificationDocument({ filing, caseRef, caseTitle }: { filing: RegulatorNotificationFilingDetails; caseRef: string; caseTitle: string }) {
  return (
    <div className="space-y-6 font-mono text-sm">
      <div className="text-center">
        <p className="text-xs font-bold tracking-widest text-on-surface-variant uppercase">Regulator Incident Notification</p>
        <h1 className="mt-1 text-xl font-bold text-on-surface">Draft: {caseRef}</h1>
        <p className="mt-0.5 text-xs text-on-surface-variant">{caseTitle}</p>
      </div>

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Institution name" value={filing.reportingInstitutionName} />
        <Field label="Incident classification" value={filing.incidentClassification} />
        <Field label="Financial exposure (NGN)" value={filing.financialExposureNgn} />
      </dl>

      <section>
        <h2 className="mb-2 text-xs font-bold tracking-wider text-tertiary uppercase">Narrative</h2>
        <p className="whitespace-pre-wrap text-on-surface">{filing.narrative || "—"}</p>
      </section>
    </div>
  );
}
