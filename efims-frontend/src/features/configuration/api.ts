import "server-only";
import { backendFetch } from "@/lib/backend-client";
import type { AllCurrentConfiguration, CdKey, ConfigurationEntry, ConfigurationKeyDetail } from "./types";

export async function getAllCurrentConfiguration(accessToken: string): Promise<AllCurrentConfiguration> {
  return backendFetch<AllCurrentConfiguration>("/configuration", { accessToken });
}

export async function getConfigurationKeyDetail(accessToken: string, key: CdKey): Promise<ConfigurationKeyDetail> {
  return backendFetch<ConfigurationKeyDetail>(`/configuration/${key}`, { accessToken });
}

export async function createConfigurationDraft(
  accessToken: string,
  key: CdKey,
  input: { value: Record<string, unknown>; notes?: string },
): Promise<ConfigurationEntry> {
  return backendFetch<ConfigurationEntry>(`/configuration/${key}`, { method: "POST", body: input, accessToken });
}

export async function ratifyConfigurationVersion(
  accessToken: string,
  key: CdKey,
  version: number,
  input: { effectiveDate?: string; notes?: string },
): Promise<ConfigurationEntry> {
  return backendFetch<ConfigurationEntry>(`/configuration/${key}/${version}/ratify`, { method: "POST", body: input, accessToken });
}
