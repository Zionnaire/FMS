"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/features/auth/session";
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
