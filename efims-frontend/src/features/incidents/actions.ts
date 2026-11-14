"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/features/auth/session";
import type { FormState } from "@/lib/form-state";
import { parseActionError } from "@/lib/form-state";
import * as api from "./api";

export async function relateIncidentsAction(incidentId: string, formData: FormData): Promise<void> {
  const { accessToken } = await requireSession();
  await api.relateIncidents(accessToken, incidentId, String(formData.get("relatedIncidentId") ?? ""));
  revalidatePath(`/incidents/${incidentId}`);
}

export async function mergeIncidentAction(incidentId: string, formData: FormData): Promise<void> {
  const { accessToken } = await requireSession();
  await api.mergeIncident(accessToken, incidentId, String(formData.get("targetIncidentId") ?? ""));
  revalidatePath(`/incidents/${incidentId}`);
}

/** Every field optional — a "fill in what you know" progressive-disclosure section, not a
 * required form. The 4 boolean fields are tri-state `<select>`s ("Unknown"/"Yes"/"No"), not
 * checkboxes: an unchecked checkbox and a never-touched field are indistinguishable in FormData,
 * which would make resubmitting the form silently reset an already-known `true` back to `false`. */
function parseTriState(formData: FormData, field: string): boolean | undefined {
  const value = formData.get(field);
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

export async function updateRiskFactorsAction(incidentId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  const { accessToken } = await requireSession();

  const financialExposureNgn = formData.get("financialExposureNgn");
  const customerImpactCount = formData.get("customerImpactCount");
  const channel = formData.get("channel");
  const reportedByType = formData.get("reportedByType");

  try {
    await api.updateRiskFactors(accessToken, incidentId, {
      financialExposureNgn: financialExposureNgn ? Number(financialExposureNgn) : undefined,
      customerImpactCount: customerImpactCount ? Number(customerImpactCount) : undefined,
      ongoingThreat: parseTriState(formData, "ongoingThreat"),
      insiderInvolvement: parseTriState(formData, "insiderInvolvement"),
      dataCompromise: parseTriState(formData, "dataCompromise"),
      regulatoryRelevance: parseTriState(formData, "regulatoryRelevance"),
      channel: channel ? String(channel) : undefined,
      reportedByType: reportedByType ? String(reportedByType) : undefined,
    });
  } catch (error) {
    return parseActionError(error);
  }
  revalidatePath(`/incidents/${incidentId}`);
  return {};
}
