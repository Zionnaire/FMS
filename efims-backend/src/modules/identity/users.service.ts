import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditOutcome, Compartment, Prisma, Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user.interface';
import { AuditService } from '../audit/audit.service';
import { CreateUserDto } from './dto/create-user.dto';

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  role: string;
  clearanceLevel: number;
  status: string;
  compartments: Compartment[];
}

/** A grant is "active" if it was never revoked and hasn't passed its `expiresAt` (both added
 * 2026-10-14 for "temporary grants") — a permanent grant has neither set. Used everywhere a
 * user's *current* compartment set matters; the revoked/expired rows themselves are never
 * deleted (see `UserCompartmentGrant`'s own doc comment), so this filter, not row absence, is
 * what "no longer granted" means from here on. A function, not a module-level constant — `now`
 * must be evaluated per call, not frozen at the moment this file was first imported. */
function activeGrantWhere(): Prisma.UserCompartmentGrantWhereInput {
  return { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] };
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /** Admin-only (enforced by `@Roles(Role.ADMIN)` at the controller) — creates a user in the
   * *acting admin's own tenant*, taken from their JWT (`forCurrentTenant`), never from a
   * client-supplied tenant id. There is deliberately no way to pass a tenantId into this
   * method: cross-tenant user creation would be exactly the kind of leakage RLS exists to
   * prevent, and this closes off the application-layer half of that even before RLS would
   * catch it. */
  async createUser(actor: AuthenticatedUser, dto: CreateUserDto): Promise<UserProfile> {
    const existing = await this.prisma.forCurrentTenant((tx) =>
      tx.user.findUnique({ where: { tenantId_email: { tenantId: actor.tenantId, email: dto.email } } }),
    );
    if (existing) {
      throw new ConflictException('A user with this email already exists in this tenant');
    }

    const passwordHash = await argon2.hash(dto.temporaryPassword);

    const created = await this.prisma.forCurrentTenant((tx) =>
      tx.user.create({
        data: {
          tenantId: actor.tenantId,
          email: dto.email,
          fullName: dto.fullName,
          role: dto.role,
          clearanceLevel: dto.clearanceLevel,
          passwordHash,
          compartmentGrants: dto.compartments
            ? {
                create: dto.compartments.map((compartment) => ({
                  tenantId: actor.tenantId,
                  compartment,
                })),
              }
            : undefined,
        },
        include: { compartmentGrants: { where: activeGrantWhere() } },
      }),
    );

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'identity.user.create',
      entityType: 'User',
      entityId: created.id,
      outcome: AuditOutcome.SUCCESS,
      metadata: { email: created.email, role: created.role },
    });

    return toProfile(created);
  }

  async getProfile(actor: AuthenticatedUser): Promise<UserProfile> {
    const user = await this.prisma.forCurrentTenant((tx) =>
      tx.user.findUnique({
        where: { id: actor.sub },
        include: { compartmentGrants: { where: activeGrantWhere() } },
      }),
    );
    if (!user) {
      // The JWT was valid but the user row is gone (deleted after the token was issued) —
      // surfaces as 404 rather than a confusing 200-with-nothing.
      throw new NotFoundException('User not found');
    }
    return toProfile(user);
  }

  /** Every user in the caller's own tenant — added once the frontend needed a way to resolve a
   * user id (case flag `userId`, CAPA action `ownerId`, ...) to a display name at all; nothing
   * before this could do that except `GET /users/me` (self only). Same "no sensitive information
   * on a user row itself" reasoning `TeamsController.list` already documents for `Team` — an
   * email/full name/role within your own tenant isn't compartment-grant-sensitive, so this is
   * open to any authenticated user, not admin-gated like `createUser`. */
  async list(): Promise<UserProfile[]> {
    const users = await this.prisma.forCurrentTenant((tx) =>
      tx.user.findMany({
        where: { status: 'ACTIVE' },
        include: { compartmentGrants: { where: activeGrantWhere() } },
        orderBy: { fullName: 'asc' },
      }),
    );
    return users.map(toProfile);
  }

  /** Narrow cross-module read for other modules' compartment-visibility checks (e.g.
   * `incidents`' Incident-level filtering) — per CLAUDE.md non-negotiable #2, callers outside
   * `identity` reach `user_compartment_grants` through this method, never through Prisma
   * directly. Deliberately returns just the compartment list, not a full UserProfile, so
   * callers can't casually depend on unrelated user fields. */
  async getGrantedCompartments(userId: string): Promise<Compartment[]> {
    const grants = await this.prisma.forCurrentTenant((tx) =>
      tx.userCompartmentGrant.findMany({ where: { userId, ...activeGrantWhere() }, select: { compartment: true } }),
    );
    return grants.map((g) => g.compartment);
  }

  /** Cross-module existence check — used by `cases`' CasesService before flagging a user as a
   * case subject/conflict, so a typo'd or foreign user id fails clearly instead of silently
   * creating a flag nothing will ever match against. */
  async assertUserExists(userId: string): Promise<void> {
    const user = await this.prisma.forCurrentTenant((tx) => tx.user.findUnique({ where: { id: userId } }));
    if (!user) {
      throw new NotFoundException('User not found');
    }
  }

  /** Applies an already-APPROVED `AccessChangeRequest` — called only from
   * `AccessChangeService.decide`, never exposed as its own route. A grant is an upsert on the
   * `[userId, compartment]` unique constraint: re-granting a previously-revoked compartment
   * clears `revokedAt`/sets a fresh `grantedAt`/`expiresAt` rather than erroring, since "grant it
   * again, possibly with a new expiry" is the realistic second-time scenario, not a conflict. */
  async grantCompartment(tenantId: string, userId: string, compartment: Compartment, grantedBy: string, expiresAt?: Date): Promise<void> {
    await this.prisma.forCurrentTenant((tx) =>
      tx.userCompartmentGrant.upsert({
        where: { userId_compartment: { userId, compartment } },
        create: { tenantId, userId, compartment, grantedBy, expiresAt },
        update: { grantedAt: new Date(), grantedBy, expiresAt: expiresAt ?? null, revokedAt: null },
      }),
    );
  }

  /** Sets `revokedAt` — never deletes the row, so the grant's own history (it existed, who
   * granted it, when it was revoked) stays queryable. A no-op (not an error) if no active grant
   * exists for this compartment: revoking something already revoked/expired/never-granted is an
   * idempotent "make sure it's off," not a failure. */
  async revokeCompartment(userId: string, compartment: Compartment): Promise<void> {
    await this.prisma.forCurrentTenant((tx) =>
      tx.userCompartmentGrant.updateMany({ where: { userId, compartment, revokedAt: null }, data: { revokedAt: new Date() } }),
    );
  }

  /** Applies an already-APPROVED `ROLE_CHANGE` `AccessChangeRequest`. */
  async changeRole(userId: string, role: Role): Promise<void> {
    await this.prisma.forCurrentTenant((tx) => tx.user.update({ where: { id: userId }, data: { role } }));
  }

  /** Every active user id holding a given role, in the current tenant — used by
   * `notifications`' `NotificationsService` to notify whoever is authorized to decide a newly
   * requested `ApprovalRequest` (per `workflow`'s `APPROVAL_MATRIX`), without `notifications`
   * ever querying `users` directly. Only `ACTIVE` users: a deactivated account shouldn't be
   * notified about work it can no longer act on. */
  async listActiveUserIdsByRole(role: Role): Promise<string[]> {
    const users = await this.prisma.forCurrentTenant((tx) =>
      tx.user.findMany({ where: { role, status: 'ACTIVE' }, select: { id: true } }),
    );
    return users.map((u) => u.id);
  }
}

function toProfile(user: {
  id: string;
  email: string;
  fullName: string;
  role: string;
  clearanceLevel: number;
  status: string;
  compartmentGrants: { compartment: Compartment }[];
}): UserProfile {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    clearanceLevel: user.clearanceLevel,
    status: user.status,
    compartments: user.compartmentGrants.map((g) => g.compartment),
  };
}
