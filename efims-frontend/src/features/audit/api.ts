import "server-only";
import { backendFetch } from "@/lib/backend-client";
import type { AuditOutcome, AuditStats, ChainVerificationResult, ListAuditEventsResult } from "./types";

export interface QueryAuditEventsParams {
  accessToken: string;
  entityType?: string;
  entityId?: string;
  actorUserId?: string;
  action?: string;
  outcome?: AuditOutcome;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export async function queryAuditEvents({ accessToken, ...filters }: QueryAuditEventsParams): Promise<ListAuditEventsResult> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const query = params.toString();
  return backendFetch<ListAuditEventsResult>(`/audit-events${query ? `?${query}` : ""}`, { accessToken });
}

export async function verifyAuditChain(accessToken: string): Promise<ChainVerificationResult> {
  return backendFetch<ChainVerificationResult>("/audit-events/verify", { accessToken });
}

export async function getAuditStats(accessToken: string): Promise<AuditStats> {
  return backendFetch<AuditStats>("/audit-events/stats", { accessToken });
}
