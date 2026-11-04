import "server-only";
import { backendFetch } from "@/lib/backend-client";
import type { Compartment } from "@/features/auth/types";
import type { ListSignalsResult, Signal, SignalSource, SignalStatus } from "./types";

export interface ListSignalsParams {
  accessToken: string;
  status?: SignalStatus;
  source?: SignalSource;
  q?: string;
  /** Filters to signals reported by the calling user — the Incident Reporter dashboard's "My
   * reports" view. */
  mine?: boolean;
  limit?: number;
  offset?: number;
}

export async function listSignals({ accessToken, status, source, q, mine, limit, offset }: ListSignalsParams): Promise<ListSignalsResult> {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (source) params.set("source", source);
  if (q) params.set("q", q);
  if (mine) params.set("mine", "true");
  if (limit !== undefined) params.set("limit", String(limit));
  if (offset !== undefined) params.set("offset", String(offset));
  const query = params.toString();
  return backendFetch<ListSignalsResult>(`/signals${query ? `?${query}` : ""}`, { accessToken });
}

export interface SignalStats {
  total: number;
  byStatus: Record<SignalStatus, number>;
  whistleblowerCount: number;
}

export async function getSignalStats(accessToken: string): Promise<SignalStats> {
  return backendFetch<SignalStats>("/signals/stats", { accessToken });
}

export async function getSignal(accessToken: string, id: string): Promise<Signal> {
  return backendFetch<Signal>(`/signals/${id}`, { accessToken });
}

export interface CreateSignalInput {
  source: SignalSource;
  externalRef?: string;
  summary: string;
  payload?: Record<string, unknown>;
  isAnonymous?: boolean;
  reporterName?: string;
  reporterContact?: string;
}

export async function createSignal(accessToken: string, input: CreateSignalInput): Promise<Signal> {
  return backendFetch<Signal>("/signals", { method: "POST", body: input, accessToken });
}

export interface ValidateSignalInput {
  linkToIncidentId?: string;
  category?: string;
  type?: string;
  subtype?: string;
  title?: string;
  description?: string;
  compartment?: Compartment;
  occurredAt?: string;
}

export async function validateSignal(accessToken: string, id: string, input: ValidateSignalInput): Promise<Signal> {
  return backendFetch<Signal>(`/signals/${id}/validate`, { method: "POST", body: input, accessToken });
}

export async function rejectSignal(accessToken: string, id: string, reason: string): Promise<Signal> {
  return backendFetch<Signal>(`/signals/${id}/reject`, { method: "POST", body: { reason }, accessToken });
}
