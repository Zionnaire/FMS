import type { Compartment, Role } from "@/features/auth/types";

/** `email`/`role`/`clearanceLevel`/`compartments` are only present when the caller is `ADMIN` —
 * every other role gets just `{id, fullName, status}` back from `GET /users` (see
 * `UsersService.list`'s own doc comment: this endpoint used to hand every tenant user's exact
 * role/clearance/email/compartments to any authenticated caller, including `INCIDENT_REPORTER`,
 * found live via an RBAC audit). The name-lookup consumers throughout this app (`userDisplayNameMap`
 * and friends) only ever need `id`/`fullName`, which are always present regardless of viewer role. */
export interface UserProfile {
  id: string;
  email?: string;
  fullName: string;
  role?: Role;
  clearanceLevel?: number;
  status: "ACTIVE" | "SUSPENDED" | "DEACTIVATED";
  compartments?: Compartment[];
}

export interface CreateUserInput {
  email: string;
  fullName: string;
  role: Role;
  clearanceLevel: number;
  compartments?: Compartment[];
  temporaryPassword: string;
}

/** Mirrors the backend's `AccessChangeType`/`AccessChangeStatus` enums (schema.prisma) — the
 * maker-checker flow `grantCompartment`/`revokeCompartment`/`changeRole` are only reachable
 * through (`identity/access-change.service.ts`'s own doc comment: no direct/unmediated endpoint
 * exists for any of the three). */
export const ACCESS_CHANGE_TYPES = ["ROLE_CHANGE", "GRANT_COMPARTMENT", "REVOKE_COMPARTMENT"] as const;
export type AccessChangeType = (typeof ACCESS_CHANGE_TYPES)[number];

export const ACCESS_CHANGE_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export type AccessChangeStatus = (typeof ACCESS_CHANGE_STATUSES)[number];

export interface AccessChangeRequest {
  id: string;
  tenantId: string;
  targetUserId: string;
  changeType: AccessChangeType;
  payload: { role?: Role; compartment?: Compartment; expiresAt?: string };
  status: AccessChangeStatus;
  requestNotes: string;
  requestedBy: string;
  requestedAt: string;
  decisionNotes: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
}

export interface RequestAccessChangeInput {
  changeType: AccessChangeType;
  role?: Role;
  compartment?: Compartment;
  /** GRANT_COMPARTMENT only — omit for a permanent grant. */
  expiresAt?: string;
  requestNotes: string;
}

export interface DecideAccessChangeInput {
  approved: boolean;
  decisionNotes?: string;
}
