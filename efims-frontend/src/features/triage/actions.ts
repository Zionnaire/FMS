"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/features/auth/session";
import type { SeverityTier } from "./types";
import * as api from "./api";

function readInput(formData: FormData) {
  return {
    severity: formData.get("severity") as SeverityTier,
    slaCalendarName: String(formData.get("slaCalendarName") ?? ""),
    assignedTeamId: (formData.get("assignedTeamId") as string) || undefined,
    rationale: String(formData.get("rationale") ?? ""),
  };
}

export async function assessIncidentAction(incidentId: string, formData: FormData): Promise<void> {
  const { accessToken } = await requireSession();
  await api.assessIncident(accessToken, incidentId, readInput(formData));
  revalidatePath(`/incidents/${incidentId}`);
}

export async function escalateIncidentAction(incidentId: string, formData: FormData): Promise<void> {
  const { accessToken } = await requireSession();
  await api.escalateIncident(accessToken, incidentId, readInput(formData));
  revalidatePath(`/incidents/${incidentId}`);
}
