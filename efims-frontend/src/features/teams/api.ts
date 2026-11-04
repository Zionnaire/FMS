import "server-only";
import { backendFetch } from "@/lib/backend-client";
import type { Team } from "./types";

export async function listTeams(accessToken: string): Promise<Team[]> {
  return backendFetch<Team[]>("/teams", { accessToken });
}

export async function addTeamMember(accessToken: string, teamId: string, userId: string): Promise<void> {
  return backendFetch<void>(`/teams/${teamId}/members`, { method: "POST", body: { userId }, accessToken });
}
