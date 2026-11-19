export const OBLIGATION_TYPES = ["STR_SAR_FILING", "REGULATOR_NOTIFICATION", "OTHER"] as const;
export type ObligationType = (typeof OBLIGATION_TYPES)[number];

export const OBLIGATION_STATUSES = ["PENDING", "SUBMITTED", "ACKNOWLEDGED", "WAIVED"] as const;
export type ObligationStatus = (typeof OBLIGATION_STATUSES)[number];

export interface RegulatorySubmission {
  id: string;
  tenantId: string;
  obligationId: string;
  approvalId: string;
  referenceNumber: string | null;
  notes: string | null;
  submittedBy: string;
  submittedAt: string;
}

/** One row per subject of report — a real STR/SAR required field. Free-entry: EFIMS has no
 * customer/account entity to pick these from (see `docs/OPEN_ITEMS.md`'s customer-360 gap), so
 * an analyst types them in directly from whatever source system they're working from. */
export interface StrSubject {
  name: string;
  idNumber: string;
  role: string;
}

/** One row of the transaction schedule — same "no ledger entity to pull from, hand-entered"
 * reasoning as `StrSubject`. */
export interface StrTransaction {
  date: string;
  channel: string;
  amountNgn: string;
  beneficiary: string;
}

/** `RegulatoryObligation.filingDetails`'s real shape for `STR_SAR_FILING` — see that field's own
 * doc comment in `schema.prisma` for what this is and is NOT (no real NFIU/goAML integration). */
export interface StrFilingDetails {
  reportingInstitutionName: string;
  cbnInstitutionCode: string;
  complianceOfficerName: string;
  subjects: StrSubject[];
  groundsOfSuspicion: string;
  transactions: StrTransaction[];
}

/** `filingDetails`'s real shape for `REGULATOR_NOTIFICATION` — deliberately much lighter than
 * the STR shape: a regulator incident notification is closer to a structured narrative +
 * exposure figure than a multi-section form. */
export interface RegulatorNotificationFilingDetails {
  reportingInstitutionName: string;
  incidentClassification: string;
  narrative: string;
  financialExposureNgn: string;
}

export type FilingDetails = StrFilingDetails | RegulatorNotificationFilingDetails;

export interface RegulatoryObligation {
  id: string;
  tenantId: string;
  caseId: string;
  obligationType: ObligationType;
  description: string;
  regulatorName: string | null;
  filingDetails: FilingDetails | null;
  deadline: string;
  status: ObligationStatus;
  identifiedBy: string;
  identifiedAt: string;
  acknowledgedRef: string | null;
  acknowledgedAt: string | null;
  waivedReason: string | null;
  waivedBy: string | null;
  waivedAt: string | null;
  submissions?: RegulatorySubmission[];
}

/** `GET /regulatory-obligations`'s row shape — one row per obligation across every accessible
 * case, backing the top-level Regulatory reports register page. */
export interface RegulatoryRegisterRow extends RegulatoryObligation {
  case: { referenceCode: string; title: string };
}
