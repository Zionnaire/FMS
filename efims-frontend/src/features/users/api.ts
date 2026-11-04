import "server-only";
import { backendFetch } from "@/lib/backend-client";
import type { AccessChangeRequest, CreateUserInput, DecideAccessChangeInput, RequestAccessChangeInput, UserProfile } from "./types";

/** Every active user in the caller's tenant — used to resolve a user id (case flag `userId`,
 * CAPA `ownerId`, ...) to a display name, and to populate user-picker dropdowns. `GET /users`
 * was added to the backend specifically because the frontend had no other way to do this. */
export async function listUsers(accessToken: string): Promise<UserProfile[]> {
  return backendFetch<UserProfile[]>("/users", { accessToken });
}

/** Builds an id -> displayName lookup once per request — every page that needs to show "who did
 * this" for a handful of user ids should call `listUsers` once and build this locally rather
 * than fetching per-id. */
export function userDisplayNameMap(users: UserProfile[]): Map<string, string> {
  return new Map(users.map((u) => [u.id, u.fullName]));
}

/** There is no `GET /users/:id` — `GET /users` already returns every active user in the tenant
 * (see `UsersService.list`'s own doc comment on why it's open, not admin-gated), so a single
 * user's profile is just one entry from that same list rather than a second round trip. */
export function findUser(users: UserProfile[], id: string): UserProfile | undefined {
  return users.find((u) => u.id === id);
}

export async function createUser(accessToken: string, input: CreateUserInput): Promise<UserProfile> {
  return backendFetch<UserProfile>("/users", { method: "POST", body: input, accessToken });
}

export async function requestAccessChange(accessToken: string, userId: string, input: RequestAccessChangeInput): Promise<AccessChangeRequest> {
  return backendFetch<AccessChangeRequest>(`/users/${userId}/access-changes`, { method: "POST", body: input, accessToken });
}

export async function listAccessChangesForUser(accessToken: string, userId: string): Promise<AccessChangeRequest[]> {
  return backendFetch<AccessChangeRequest[]>(`/users/${userId}/access-changes`, { accessToken });
}

export async function listAllAccessChangeRequests(accessToken: string): Promise<AccessChangeRequest[]> {
  return backendFetch<AccessChangeRequest[]>("/access-change-requests", { accessToken });
}

export async function decideAccessChange(accessToken: string, id: string, input: DecideAccessChangeInput): Promise<AccessChangeRequest> {
  return backendFetch<AccessChangeRequest>(`/access-change-requests/${id}/decide`, { method: "POST", body: input, accessToken });
}
