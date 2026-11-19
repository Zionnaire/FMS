import "server-only";
import { backendFetch } from "@/lib/backend-client";

export interface BackendReadiness {
  status: "ok" | "error";
  info?: { database?: { status: string } };
  error?: Record<string, unknown>;
}

/** `GET /health/ready` — a real `SELECT 1` against Postgres (see `health.controller.ts`'s own
 * doc comment), not the plain `/health` liveness check, which deliberately never touches the
 * database. `skipAuth` since this route is `@Public()` — a load balancer/this page's own health
 * check has no JWT to present. */
export async function getBackendReadiness(): Promise<BackendReadiness> {
  return backendFetch<BackendReadiness>("/health/ready", { skipAuth: true });
}
