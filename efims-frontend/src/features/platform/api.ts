import "server-only";
import { backendFetch } from "@/lib/backend-client";
import type { PlatformLoginResult, Tenant, TenantStatus, TenantSummary } from "./types";

export async function platformLogin(email: string, password: string): Promise<PlatformLoginResult> {
  return backendFetch<PlatformLoginResult>("/platform/auth/login", { method: "POST", body: { email, password }, skipAuth: true });
}

export async function listTenants(accessToken: string): Promise<TenantSummary[]> {
  return backendFetch<TenantSummary[]>("/platform/tenants", { accessToken });
}

export interface CreateTenantInput {
  name: string;
  slug: string;
  adminEmail: string;
  adminFullName: string;
  adminPassword: string;
}

export async function createTenant(accessToken: string, input: CreateTenantInput): Promise<Tenant> {
  return backendFetch<Tenant>("/platform/tenants", { method: "POST", body: input, accessToken });
}

export async function updateTenantStatus(accessToken: string, id: string, status: TenantStatus): Promise<Tenant> {
  return backendFetch<Tenant>(`/platform/tenants/${id}/status`, { method: "PATCH", body: { status }, accessToken });
}
