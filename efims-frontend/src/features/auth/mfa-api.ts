import "server-only";
import { backendFetch } from "@/lib/backend-client";

export interface MfaStatus {
  enabled: boolean;
  enrolledAt: string | null;
}

export async function getMfaStatus(accessToken: string): Promise<MfaStatus> {
  return backendFetch<MfaStatus>("/auth/mfa/status", { accessToken });
}
