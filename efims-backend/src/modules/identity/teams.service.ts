import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditOutcome, Team } from '@prisma/client';
import { PrismaService, TenantScopedClient } from '../../infrastructure/database/prisma.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user.interface';
import { AuditService } from '../audit/audit.service';

/**
 * Owns every read of `Team`, plus the one write this module needed for `cases`' access-control
 * check to be provable at all (see `addMember`) — otherwise team management remains seed-only,
 * same as before this module existed. Split out from `UsersService` because "who is on which
 * team" and "what teams exist" are a distinct enough concern from user identity/auth to warrant
 * their own file, matching the existing `AuthService`/`UsersService` split.
 */
@Injectable()
export class TeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /** Optional `tx`: see `getUserTeamIds`'s own doc comment — same "share the caller's
   * transaction instead of opening a second one" reasoning. */
  async list(tx?: TenantScopedClient): Promise<Team[]> {
    const query = (client: TenantScopedClient) => client.team.findMany({ orderBy: { name: 'asc' } });
    return tx ? query(tx) : this.prisma.forCurrentTenant(query);
  }

  /** Cross-module existence check — used by `triage`'s TriageService to validate a routing
   * team before recording a TriageAssessment, and by `cases`' CasesService before assigning a
   * case's team. Per CLAUDE.md non-negotiable #2, other modules reach `teams` through this
   * method, never by querying Prisma directly. */
  async assertExists(teamId: string): Promise<Team> {
    const team = await this.prisma.forCurrentTenant((tx) => tx.team.findUnique({ where: { id: teamId } }));
    if (!team) {
      throw new NotFoundException('Team not found');
    }
    return team;
  }

  /** Single-team-membership check — used by `cases`' single-record access check
   * (CasesService.checkAccess), where only one case's team needs testing per call. See
   * `getUserTeamIds` for the batch-oriented sibling used when filtering many cases at once. */
  async isUserOnTeam(userId: string, teamId: string): Promise<boolean> {
    const membership = await this.prisma.forCurrentTenant((tx) =>
      tx.teamMembership.findUnique({ where: { teamId_userId: { teamId, userId } } }),
    );
    return membership !== null;
  }

  /** Every team id a user belongs to, in one query — used by `cases`' CasesService.list to
   * filter many cases against team membership without an N+1 query per case (a lesson learned
   * live, the hard way, during this project's own database verification — see
   * docs/CHANGELOG.md's 2026-09-21 "First live database verification" entry). */
  /** Optional `tx`: see `UsersService.getGrantedCompartments`'s own doc comment — same
   * "share the caller's transaction instead of opening a second one" reasoning. */
  async getUserTeamIds(userId: string, tx?: TenantScopedClient): Promise<string[]> {
    const query = (client: TenantScopedClient) => client.teamMembership.findMany({ where: { userId }, select: { teamId: true } });
    const memberships = tx ? await query(tx) : await this.prisma.forCurrentTenant(query);
    return memberships.map((m) => m.teamId);
  }

  /** The reverse of `getUserTeamIds` — every user id on a given team. Used by
   * `notifications`' `NotificationsService` to fan a "case assigned to your team" notification
   * out to every member, without `notifications` ever querying `team_memberships` directly. */
  async listMemberIds(teamId: string): Promise<string[]> {
    const memberships = await this.prisma.forCurrentTenant((tx) =>
      tx.teamMembership.findMany({ where: { teamId }, select: { userId: true } }),
    );
    return memberships.map((m) => m.userId);
  }

  /** Admin-only (enforced at the controller, matching UsersController.createUser's own
   * reasoning) — idempotent (a duplicate add is a no-op, not an error, since the caller's intent
   * — "this user should be on this team" — is already satisfied). Deliberately minimal: no
   * remove-member endpoint yet, no self-service team joining, no team creation via API at all —
   * added only because `cases`' team-match access condition had no way to be exercised through
   * the API without it (see docs/CHANGELOG.md's `cases` module entry). */
  async addMember(actor: AuthenticatedUser, teamId: string, userId: string): Promise<void> {
    await this.assertExists(teamId);

    await this.prisma.forCurrentTenant((tx) =>
      tx.teamMembership.upsert({
        where: { teamId_userId: { teamId, userId } },
        update: {},
        create: { tenantId: actor.tenantId, teamId, userId },
      }),
    );

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'identity.team.add_member',
      entityType: 'Team',
      entityId: teamId,
      outcome: AuditOutcome.SUCCESS,
      metadata: { userId },
    });
  }
}
