import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ApprovalAction, ApprovalStatus, AuditOutcome, Case, CaseStatus, CaseStatusHistory, CaseUserFlag, CaseUserRelationType, Compartment, Prisma } from '@prisma/client';
import { PrismaService, TenantScopedClient } from '../../infrastructure/database/prisma.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user.interface';
import { DEFAULT_PAGE_SIZE } from '../../common/dto/pagination-query.dto';
import { CASE_STATUS_CHANGED_EVENT, CaseStatusChangedEvent } from '../../common/events/domain-events';
import { ELEVATED_ROLES } from '../../common/constants/roles';
import { AuditService } from '../audit/audit.service';
import { TeamsService } from '../identity/teams.service';
import { UsersService } from '../identity/users.service';
import { IncidentsService } from '../incidents/incidents.service';
import { ApprovalService } from '../workflow/approval.service';
import { AddCaseUserFlagDto } from './dto/add-case-user-flag.dto';
import { AssignCaseTeamDto } from './dto/assign-case-team.dto';
import { CreateCaseDto } from './dto/create-case.dto';
import { LinkIncidentDto } from './dto/link-incident.dto';
import { UpdateCaseStatusDto } from './dto/update-case-status.dto';

/** `ELEVATED_ROLES` now lives in `common/constants/roles.ts` — see that file's own doc comment.
 * Bypasses architecture.md §4.3's team-match condition — cross-cutting oversight functions that
 * legitimately need to see cases outside their own team, as opposed to
 * INVESTIGATOR/TEAM_LEAD/CASE_OWNER, who need actual `TeamMembership` on the case's assigned
 * team. Not stated explicitly in architecture.md (which just says "or elevated role" without
 * naming one) — this mapping is a flagged scope decision, same as ConfigurationController's
 * CD-owner-to-Role mapping caveat. */

/** `list()`'s row shape — the bare `Case` plus two cheap joins (`_count`/`assignedTeam.name`)
 * the cases list page needs to render without an N+1 per row. `getById` still returns a bare
 * `Case`; the detail page already has its own team/incident lookups where it needs them. */
export type CaseListItem = Case & { linkedIncidentsCount: number; assignedTeamName: string | null };

/** Tenant-wide, access-filtered (same 7-condition rule as `list`/`getById` — never a raw table
 * count) summary for the cases list page's KPI row. All amounts are NGN — see RecoveryService's
 * own doc comment on why that's this codebase's one currency precedent, not an assumption made
 * fresh here. */
export interface CaseStats {
  total: number;
  byStatus: Record<CaseStatus, number>;
  highSensitivityCount: number;
  pendingApprovals: number;
  totalLoss: string;
  totalRecovered: string;
  outstanding: string;
  currency: 'NGN';
}

/**
 * Owns `Case`, `CaseUserFlag`, `CaseStatusHistory` — architecture.md's "case record, team,
 * status history". This is the module CLAUDE.md non-negotiable #6 is actually about: every read
 * of a specific case runs the full 7-condition check from architecture.md §4.3 (tenant, role,
 * team, subject, conflict, clearance, compartment) via `checkAccess`, and every denial is
 * audited. Two of those 7 conditions are enforced elsewhere, deliberately not duplicated here:
 * tenant match is RLS + `PrismaService.forCurrentTenant` (a query under the wrong tenant context
 * simply returns nothing); per-action role permission is enforced at the controller level via
 * `@Roles()` on mutating routes, the same pattern every other module in this codebase already
 * uses, rather than a second authorization layer inside this service.
 */
@Injectable()
export class CasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly usersService: UsersService,
    private readonly teamsService: TeamsService,
    private readonly incidentsService: IncidentsService,
    private readonly approvalService: ApprovalService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(actor: AuthenticatedUser, dto: CreateCaseDto): Promise<Case> {
    if (dto.assignedTeamId) {
      await this.teamsService.assertExists(dto.assignedTeamId);
    }
    // Visibility-check every incident to link BEFORE creating the case — a caller shouldn't be
    // able to learn an incident exists (via a validation error naming it) by trying to link it
    // to a new case, if they couldn't see it in the first place.
    if (dto.incidentIds?.length) {
      for (const incidentId of dto.incidentIds) {
        await this.incidentsService.getById(actor, incidentId);
      }
    }

    let created: Case;
    try {
      created = await this.prisma.forCurrentTenant(async (tx) => {
        const referenceCode = await this.generateReferenceCode(tx, actor.tenantId);
        const created = await tx.case.create({
          data: {
            tenantId: actor.tenantId,
            referenceCode,
            title: dto.title,
            description: dto.description,
            sensitivityLevel: dto.sensitivityLevel,
            compartment: dto.compartment ?? Compartment.STANDARD,
            assignedTeamId: dto.assignedTeamId,
            createdBy: actor.sub,
          },
        });
        await tx.caseStatusHistory.create({
          data: { tenantId: actor.tenantId, caseId: created.id, fromStatus: null, toStatus: CaseStatus.OPEN, changedBy: actor.sub },
        });
        return created;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Same race/backstop pattern as IncidentsService.createFromSignal and
        // ConfigurationService.createDraft — two cases created in the same instant computed the
        // same reference code.
        throw new BadRequestException('Reference code collision — retry creating this case');
      }
      throw err;
    }

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'cases.case.create',
      entityType: 'Case',
      entityId: created.id,
      outcome: AuditOutcome.SUCCESS,
      metadata: { referenceCode: created.referenceCode, sensitivityLevel: created.sensitivityLevel, compartment: created.compartment },
    });

    if (dto.incidentIds?.length) {
      for (const incidentId of dto.incidentIds) {
        await this.incidentsService.linkToCase(actor, incidentId, created.id);
      }
    }

    return created;
  }

  /** Filters every case in the tenant down to the ones `actor` can actually access, batching
   * the cross-module lookups (compartment grants, team memberships) and the subject/conflict
   * flag lookup into one query each up front, rather than N+1 per case — see
   * TeamsService.getUserTeamIds's own doc comment for why that matters against this project's
   * real database. Silent filtering, not an audited denial per row, matching
   * IncidentsService.list's same precedent. */
  /** Pagination happens in-memory, over the already access-filtered set — same reasoning as
   * `IncidentsService.list`'s own doc comment: a SQL-level LIMIT/OFFSET applied before the
   * 7-condition filter would return pages padded down below `limit`. */
  async list(
    actor: AuthenticatedUser,
    status?: CaseStatus,
    limit = DEFAULT_PAGE_SIZE,
    offset = 0,
    compartment?: Compartment,
    sensitivityLevel?: number,
    q?: string,
  ): Promise<{ cases: CaseListItem[]; total: number }> {
    let visible = await this.getVisibleCases(actor, status);
    if (compartment) visible = visible.filter((c) => c.compartment === compartment);
    if (sensitivityLevel) visible = visible.filter((c) => c.sensitivityLevel === sensitivityLevel);
    if (q) {
      const needle = q.trim().toLowerCase();
      visible = visible.filter((c) => c.title.toLowerCase().includes(needle) || c.referenceCode.toLowerCase().includes(needle));
    }

    const page = visible.slice(offset, offset + limit);
    // Tenant-scoped, small (teams are hand-provisioned, not user-scale) — cheaper to list once
    // and map in JS than to add a findByIds lookup to TeamsService for this one call site.
    const teams = page.some((c) => c.assignedTeamId) ? await this.teamsService.list() : [];
    const teamNameById = new Map(teams.map((t) => [t.id, t.name]));

    const counts = page.length
      ? await this.prisma.forCurrentTenant((tx) =>
          tx.case.findMany({ where: { id: { in: page.map((c) => c.id) } }, select: { id: true, _count: { select: { incidents: true } } } }),
        )
      : [];
    const incidentCountById = new Map(counts.map((c) => [c.id, c._count.incidents]));

    return {
      cases: page.map((c) => ({
        ...c,
        linkedIncidentsCount: incidentCountById.get(c.id) ?? 0,
        assignedTeamName: c.assignedTeamId ? (teamNameById.get(c.assignedTeamId) ?? null) : null,
      })),
      total: visible.length,
    };
  }

  /** Tenant-wide KPI summary for the cases list page — same access-filtered set `list()` computes
   * (never a raw unfiltered count), plus a cross-case loss/recovery aggregate mirroring
   * RecoveryService.getSummary's per-case version. */
  async stats(actor: AuthenticatedUser): Promise<CaseStats> {
    const visible = await this.getVisibleCases(actor);
    const visibleIds = visible.map((c) => c.id);

    const byStatus: Record<CaseStatus, number> = { OPEN: 0, UNDER_INVESTIGATION: 0, ON_HOLD: 0, CLOSED: 0 };
    for (const c of visible) byStatus[c.status]++;
    const highSensitivityCount = visible.filter((c) => c.sensitivityLevel === 4).length;

    const [lossAgg, recoveryAgg, pendingApprovals] = visibleIds.length
      ? await this.prisma.forCurrentTenant((tx) =>
          Promise.all([
            tx.lossEntry.aggregate({ where: { caseId: { in: visibleIds } }, _sum: { amount: true } }),
            tx.recoveryEntry.aggregate({ where: { caseId: { in: visibleIds } }, _sum: { amount: true } }),
            tx.approvalRequest.count({ where: { caseId: { in: visibleIds }, status: ApprovalStatus.PENDING } }),
          ]),
        )
      : [{ _sum: { amount: null } }, { _sum: { amount: null } }, 0];

    const totalLoss = lossAgg._sum.amount ?? new Prisma.Decimal(0);
    const totalRecovered = recoveryAgg._sum.amount ?? new Prisma.Decimal(0);

    return {
      total: visible.length,
      byStatus,
      highSensitivityCount,
      pendingApprovals,
      totalLoss: totalLoss.toFixed(2),
      totalRecovered: totalRecovered.toFixed(2),
      outstanding: totalLoss.sub(totalRecovered).toFixed(2),
      currency: 'NGN',
    };
  }

  /** Shared access-filtering batch path behind both `list()` and `stats()` — see `list()`'s
   * original doc comment (still accurate) on why this batches the cross-module lookups instead of
   * querying per case, and why pagination/filtering happens in-memory over this already
   * access-filtered set rather than at the SQL layer. */
  private async getVisibleCases(actor: AuthenticatedUser, status?: CaseStatus): Promise<Case[]> {
    const all = await this.prisma.forCurrentTenant((tx) =>
      tx.case.findMany({ where: status ? { status } : undefined, orderBy: { createdAt: 'desc' } }),
    );

    const grantedCompartments = await this.usersService.getGrantedCompartments(actor.sub);
    const userTeamIds = await this.teamsService.getUserTeamIds(actor.sub);
    const deniedCaseIds = await this.getFlaggedCaseIds(actor.sub);

    return all.filter((c) => this.isAccessible(actor, c, grantedCompartments, userTeamIds, deniedCaseIds) === null);
  }

  /** Public wrapper around `getVisibleCases` for other modules' cross-case "queue" endpoints
   * (evidence/recovery/capa — added 2026-10-14 for the 20-role dashboard expansion) that need "every
   * case this actor can access," not one specific case. Keeps the access-filtering logic itself in
   * one place rather than each queue re-deriving it. */
  async getVisibleCaseIds(actor: AuthenticatedUser): Promise<string[]> {
    const visible = await this.getVisibleCases(actor);
    return visible.map((c) => c.id);
  }

  /** Throws NotFoundException if the case doesn't exist in this tenant, or ForbiddenException
   * (with an audited denial naming which of the 7 conditions failed) otherwise. */
  async getById(actor: AuthenticatedUser, id: string): Promise<Case> {
    const caseRecord = await this.findOrThrow(id);
    await this.assertAccess(actor, caseRecord);
    return caseRecord;
  }

  /** Cheap per-case enrichment for the case-detail header's stats ribbon — deliberately a
   * separate method from `getById` rather than changing that method's return shape, since a
   * dozen call sites in this file already depend on `getById` resolving to a bare `Case`. Reuses
   * `getById`'s own access check first. */
  async getSummary(actor: AuthenticatedUser, id: string): Promise<{ linkedIncidentsCount: number; flagsCount: number; assignedTeamName: string | null }> {
    const caseRecord = await this.getById(actor, id);
    const [counted, flagsCount, team] = await Promise.all([
      this.prisma.forCurrentTenant((tx) => tx.case.findUnique({ where: { id }, select: { _count: { select: { incidents: true } } } })),
      this.prisma.forCurrentTenant((tx) => tx.caseUserFlag.count({ where: { caseId: id } })),
      caseRecord.assignedTeamId ? this.teamsService.assertExists(caseRecord.assignedTeamId) : Promise.resolve(null),
    ]);
    return { linkedIncidentsCount: counted?._count.incidents ?? 0, flagsCount, assignedTeamName: team?.name ?? null };
  }

  /**
   * The one concrete integration point this codebase's `workflow` module wires up (see that
   * module's own doc comment in schema.prisma): closing a case requires `dto.approvalId` to
   * reference an already-APPROVED `ApprovalRequest` (action=CASE_CLOSURE) for this exact case —
   * CD-04's "Case closure" row, enforced mechanically once a human has made the actual approval
   * judgment call (which severity band applies, via `POST /cases/:id/approvals`). No other
   * status transition requires approval; this is deliberately narrow, not a general workflow
   * gate on every transition.
   */
  async updateStatus(actor: AuthenticatedUser, id: string, dto: UpdateCaseStatusDto): Promise<Case> {
    const caseRecord = await this.getById(actor, id);
    if (caseRecord.status === dto.status) {
      throw new BadRequestException(`Case is already ${dto.status.toLowerCase()}`);
    }
    if (dto.status === CaseStatus.CLOSED) {
      await this.approvalService.assertApproved(id, ApprovalAction.CASE_CLOSURE, dto.approvalId!);
    }

    const updated = await this.prisma.forCurrentTenant(async (tx) => {
      const updated = await tx.case.update({
        where: { id },
        data: { status: dto.status, closedAt: dto.status === CaseStatus.CLOSED ? new Date() : undefined },
      });
      await tx.caseStatusHistory.create({
        data: {
          tenantId: actor.tenantId,
          caseId: id,
          fromStatus: caseRecord.status,
          toStatus: dto.status,
          reason: dto.reason,
          changedBy: actor.sub,
        },
      });
      return updated;
    });

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'cases.case.status_change',
      entityType: 'Case',
      entityId: id,
      outcome: AuditOutcome.SUCCESS,
      metadata: { fromStatus: caseRecord.status, toStatus: dto.status },
    });

    this.eventEmitter.emit(CASE_STATUS_CHANGED_EVENT, {
      tenantId: actor.tenantId,
      caseId: id,
      referenceCode: updated.referenceCode,
      fromStatus: caseRecord.status,
      toStatus: dto.status,
      changedBy: actor.sub,
      assignedTeamId: updated.assignedTeamId,
    } satisfies CaseStatusChangedEvent);

    return updated;
  }

  async assignTeam(actor: AuthenticatedUser, id: string, dto: AssignCaseTeamDto): Promise<Case> {
    await this.getById(actor, id);
    await this.teamsService.assertExists(dto.teamId);

    const updated = await this.prisma.forCurrentTenant((tx) =>
      tx.case.update({ where: { id }, data: { assignedTeamId: dto.teamId } }),
    );

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'cases.case.assign_team',
      entityType: 'Case',
      entityId: id,
      outcome: AuditOutcome.SUCCESS,
      metadata: { teamId: dto.teamId },
    });

    return updated;
  }

  async linkIncident(actor: AuthenticatedUser, id: string, dto: LinkIncidentDto): Promise<void> {
    await this.getById(actor, id);
    await this.incidentsService.linkToCase(actor, dto.incidentId, id);
  }

  async addFlag(actor: AuthenticatedUser, id: string, dto: AddCaseUserFlagDto): Promise<CaseUserFlag> {
    await this.getById(actor, id);
    await this.usersService.assertUserExists(dto.userId);

    // Delete-then-recreate, not upsert — case_user_flags deliberately has no UPDATE grant (see
    // its doc comment in schema.prisma and the REVOKE in rls-policies.sql), but Prisma's
    // .upsert() compiles to `INSERT ... ON CONFLICT DO UPDATE`, which Postgres requires UPDATE
    // privilege for even on the path that never actually updates anything — caught live
    // ("permission denied for table case_user_flags") the first time this route was exercised
    // against the real database with a genuinely non-superuser role, exactly the class of bug
    // that only shows up once RLS/grants are real instead of assumed.
    const flag = await this.prisma.forCurrentTenant(async (tx) => {
      await tx.caseUserFlag.deleteMany({ where: { caseId: id, userId: dto.userId, type: dto.type } });
      return tx.caseUserFlag.create({
        data: {
          tenantId: actor.tenantId,
          caseId: id,
          userId: dto.userId,
          type: dto.type,
          reason: dto.reason,
          flaggedBy: actor.sub,
        },
      });
    });

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'cases.case.flag_add',
      entityType: 'CaseUserFlag',
      entityId: flag.id,
      outcome: AuditOutcome.SUCCESS,
      metadata: { caseId: id, flaggedUserId: dto.userId, type: dto.type },
    });

    return flag;
  }

  async removeFlag(actor: AuthenticatedUser, id: string, flagId: string): Promise<void> {
    await this.getById(actor, id);

    const flag = await this.prisma.forCurrentTenant((tx) => tx.caseUserFlag.findUnique({ where: { id: flagId } }));
    if (!flag || flag.caseId !== id) {
      throw new NotFoundException('Flag not found on this case');
    }

    await this.prisma.forCurrentTenant((tx) => tx.caseUserFlag.delete({ where: { id: flagId } }));

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'cases.case.flag_remove',
      entityType: 'CaseUserFlag',
      entityId: flagId,
      outcome: AuditOutcome.SUCCESS,
      metadata: { caseId: id, flaggedUserId: flag.userId, type: flag.type },
    });
  }

  /** Read counterpart to `addFlag`/`removeFlag` — added once the frontend's case detail page
   * needed to actually show existing flags before adding/removing one, not just write them
   * blind. Delegates the access check to `getById` first, same as every other case-scoped read
   * in this service. */
  async listFlags(actor: AuthenticatedUser, id: string): Promise<CaseUserFlag[]> {
    await this.getById(actor, id);
    return this.prisma.forCurrentTenant((tx) => tx.caseUserFlag.findMany({ where: { caseId: id }, orderBy: { flaggedAt: 'desc' } }));
  }

  /** Read counterpart to the status-history rows `updateStatus` already writes — same "the
   * frontend genuinely needs this to render, not a speculative addition" reasoning as
   * `listFlags`. */
  async listStatusHistory(actor: AuthenticatedUser, id: string): Promise<CaseStatusHistory[]> {
    await this.getById(actor, id);
    return this.prisma.forCurrentTenant((tx) =>
      tx.caseStatusHistory.findMany({ where: { caseId: id }, orderBy: { changedAt: 'desc' } }),
    );
  }

  private async findOrThrow(id: string): Promise<Case> {
    const caseRecord = await this.prisma.forCurrentTenant((tx) => tx.case.findUnique({ where: { id } }));
    if (!caseRecord) {
      throw new NotFoundException('Case not found');
    }
    return caseRecord;
  }

  /** Runs the single-record path of the access check (one query per remaining condition, each
   * short-circuited by the previous — cheap enough for a single case, unlike `list`'s batch
   * path) and audits+throws on denial. */
  private async assertAccess(actor: AuthenticatedUser, caseRecord: Case): Promise<void> {
    let denialReason: string | null = null;

    if (caseRecord.assignedTeamId && !ELEVATED_ROLES.includes(actor.role)) {
      const onTeam = await this.teamsService.isUserOnTeam(actor.sub, caseRecord.assignedTeamId);
      if (!onTeam) {
        denialReason = 'not_on_assigned_team';
      }
    }

    if (!denialReason) {
      const flag = await this.prisma.forCurrentTenant((tx) =>
        tx.caseUserFlag.findFirst({ where: { caseId: caseRecord.id, userId: actor.sub } }),
      );
      if (flag?.type === CaseUserRelationType.SUBJECT) {
        denialReason = 'user_is_subject';
      } else if (flag?.type === CaseUserRelationType.CONFLICT) {
        denialReason = 'user_has_conflict';
      }
    }

    if (!denialReason && actor.clearanceLevel < caseRecord.sensitivityLevel) {
      denialReason = 'insufficient_clearance';
    }

    if (!denialReason && caseRecord.compartment !== Compartment.STANDARD) {
      const granted = await this.usersService.getGrantedCompartments(actor.sub);
      if (!granted.includes(caseRecord.compartment)) {
        denialReason = 'compartment_not_authorized';
      }
    }

    if (denialReason) {
      await this.auditService.record({
        tenantId: actor.tenantId,
        actorUserId: actor.sub,
        action: 'cases.case.view',
        entityType: 'Case',
        entityId: caseRecord.id,
        outcome: AuditOutcome.DENIED,
        metadata: { reason: denialReason },
      });
      throw new ForbiddenException('Not authorized to access this case');
    }
  }

  /** Pure, synchronous version of the same 7-condition check for `list`'s batch path, given
   * pre-fetched context — returns a denial reason string, or null if access is allowed. Kept as
   * a second implementation rather than sharing code with `assertAccess` because the two have
   * genuinely different data-access shapes (one query per case here would defeat the point of
   * batching); see `list`'s own doc comment. */
  private isAccessible(
    actor: AuthenticatedUser,
    caseRecord: Case,
    grantedCompartments: Compartment[],
    userTeamIds: string[],
    deniedCaseIds: Set<string>,
  ): string | null {
    if (caseRecord.assignedTeamId && !ELEVATED_ROLES.includes(actor.role) && !userTeamIds.includes(caseRecord.assignedTeamId)) {
      return 'not_on_assigned_team';
    }
    if (deniedCaseIds.has(caseRecord.id)) {
      return 'flagged';
    }
    if (actor.clearanceLevel < caseRecord.sensitivityLevel) {
      return 'insufficient_clearance';
    }
    if (caseRecord.compartment !== Compartment.STANDARD && !grantedCompartments.includes(caseRecord.compartment)) {
      return 'compartment_not_authorized';
    }
    return null;
  }

  private async getFlaggedCaseIds(userId: string): Promise<Set<string>> {
    const flags = await this.prisma.forCurrentTenant((tx) =>
      tx.caseUserFlag.findMany({ where: { userId }, select: { caseId: true } }),
    );
    return new Set(flags.map((f) => f.caseId));
  }

  /** "CASE-{year}-{seq}" — identical generation pattern to IncidentsService's own
   * `generateReferenceCode`, including the same P2002-collision-as-retry-signal caveat. */
  private async generateReferenceCode(tx: TenantScopedClient, tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `CASE-${year}-`;
    const count = await tx.case.count({ where: { tenantId, referenceCode: { startsWith: prefix } } });
    return `${prefix}${String(count + 1).padStart(4, '0')}`;
  }
}
