import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditOutcome, CapaAction, CapaActionStatus, CapaValidation, CapaValidationOutcome, RootCauseAnalysis } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user.interface';
import { AuditService } from '../audit/audit.service';
import { CasesService } from '../cases/cases.service';
import { UsersService } from '../identity/users.service';
import { CancelCapaActionDto } from './dto/cancel-capa-action.dto';
import { CompleteCapaActionDto } from './dto/complete-capa-action.dto';
import { CreateCapaActionDto } from './dto/create-capa-action.dto';
import { CreateRootCauseDto } from './dto/create-root-cause.dto';
import { ValidateCapaActionDto } from './dto/validate-capa-action.dto';

/**
 * Owns `RootCauseAnalysis`/`CapaAction`/`CapaValidation` — architecture.md's "root cause,
 * actions, validation". Every method calls `casesService.getById(actor, caseId)` first, same
 * discipline as every other case-scoped module in this codebase. **No CD-04 approval gate is
 * wired here on purpose** — CD-04's matrix names exactly four actions (Containment, Loss
 * write-off, Regulatory submission, Case closure), and CAPA isn't one of them; inventing an
 * approval requirement CD-04 doesn't actually specify would be scope creep, not faithfulness to
 * the doc.
 */
@Injectable()
export class CapaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly casesService: CasesService,
    private readonly usersService: UsersService,
  ) {}

  async createRootCause(actor: AuthenticatedUser, caseId: string, dto: CreateRootCauseDto): Promise<RootCauseAnalysis> {
    await this.casesService.getById(actor, caseId);

    const created = await this.prisma.forCurrentTenant(async (tx) => {
      const latest = await tx.rootCauseAnalysis.findFirst({ where: { caseId }, orderBy: { version: 'desc' }, select: { version: true } });
      return tx.rootCauseAnalysis.create({
        data: {
          tenantId: actor.tenantId,
          caseId,
          version: (latest?.version ?? 0) + 1,
          summary: dto.summary,
          analysisMethod: dto.analysisMethod,
          identifiedBy: actor.sub,
        },
      });
    });

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'capa.root_cause.create',
      entityType: 'RootCauseAnalysis',
      entityId: created.id,
      outcome: AuditOutcome.SUCCESS,
      metadata: { caseId, version: created.version },
    });

    return created;
  }

  async listRootCauses(actor: AuthenticatedUser, caseId: string): Promise<RootCauseAnalysis[]> {
    await this.casesService.getById(actor, caseId);
    return this.prisma.forCurrentTenant((tx) => tx.rootCauseAnalysis.findMany({ where: { caseId }, orderBy: { version: 'desc' } }));
  }

  async getCurrentRootCause(actor: AuthenticatedUser, caseId: string): Promise<RootCauseAnalysis> {
    await this.casesService.getById(actor, caseId);
    const analysis = await this.prisma.forCurrentTenant((tx) => tx.rootCauseAnalysis.findFirst({ where: { caseId }, orderBy: { version: 'desc' } }));
    if (!analysis) {
      throw new NotFoundException('No root cause analysis exists for this case yet');
    }
    return analysis;
  }

  async createAction(actor: AuthenticatedUser, caseId: string, dto: CreateCapaActionDto): Promise<CapaAction> {
    await this.casesService.getById(actor, caseId);
    await this.usersService.assertUserExists(dto.ownerId);

    if (dto.rootCauseId) {
      const rootCause = await this.prisma.forCurrentTenant((tx) => tx.rootCauseAnalysis.findUnique({ where: { id: dto.rootCauseId } }));
      if (!rootCause || rootCause.caseId !== caseId) {
        throw new BadRequestException('rootCauseId does not reference a root cause analysis on this case');
      }
    }

    const created = await this.prisma.forCurrentTenant((tx) =>
      tx.capaAction.create({
        data: {
          tenantId: actor.tenantId,
          caseId,
          rootCauseId: dto.rootCauseId,
          type: dto.type,
          title: dto.title,
          description: dto.description,
          ownerId: dto.ownerId,
          dueDate: new Date(dto.dueDate),
          createdBy: actor.sub,
        },
      }),
    );

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'capa.action.create',
      entityType: 'CapaAction',
      entityId: created.id,
      outcome: AuditOutcome.SUCCESS,
      metadata: { caseId, type: created.type, ownerId: created.ownerId },
    });

    return created;
  }

  async listActions(actor: AuthenticatedUser, caseId: string, status?: CapaActionStatus): Promise<CapaAction[]> {
    await this.casesService.getById(actor, caseId);
    return this.prisma.forCurrentTenant((tx) => tx.capaAction.findMany({ where: { caseId, status }, orderBy: { dueDate: 'asc' } }));
  }

  async start(actor: AuthenticatedUser, caseId: string, actionId: string): Promise<CapaAction> {
    const action = await this.assertActionOnCase(actor, caseId, actionId);
    if (action.status !== CapaActionStatus.OPEN) {
      throw new BadRequestException(`This action is ${action.status.toLowerCase()}, not OPEN`);
    }

    const updated = await this.prisma.forCurrentTenant((tx) =>
      tx.capaAction.update({ where: { id: actionId }, data: { status: CapaActionStatus.IN_PROGRESS } }),
    );

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'capa.action.start',
      entityType: 'CapaAction',
      entityId: actionId,
      outcome: AuditOutcome.SUCCESS,
      metadata: { caseId },
    });

    return updated;
  }

  async complete(actor: AuthenticatedUser, caseId: string, actionId: string, dto: CompleteCapaActionDto): Promise<CapaAction> {
    const action = await this.assertActionOnCase(actor, caseId, actionId);
    if (action.status !== CapaActionStatus.OPEN && action.status !== CapaActionStatus.IN_PROGRESS) {
      throw new BadRequestException(`This action is ${action.status.toLowerCase()}, cannot be completed`);
    }

    const updated = await this.prisma.forCurrentTenant((tx) =>
      tx.capaAction.update({
        where: { id: actionId },
        data: { status: CapaActionStatus.COMPLETED, completionNotes: dto.completionNotes, completedAt: new Date() },
      }),
    );

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'capa.action.complete',
      entityType: 'CapaAction',
      entityId: actionId,
      outcome: AuditOutcome.SUCCESS,
      metadata: { caseId },
    });

    return updated;
  }

  async cancel(actor: AuthenticatedUser, caseId: string, actionId: string, dto: CancelCapaActionDto): Promise<CapaAction> {
    const action = await this.assertActionOnCase(actor, caseId, actionId);
    if (action.status === CapaActionStatus.VALIDATED || action.status === CapaActionStatus.CANCELLED) {
      throw new BadRequestException(`This action is already ${action.status.toLowerCase()}`);
    }

    const updated = await this.prisma.forCurrentTenant((tx) =>
      tx.capaAction.update({
        where: { id: actionId },
        data: { status: CapaActionStatus.CANCELLED, cancellationReason: dto.reason, cancelledAt: new Date() },
      }),
    );

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'capa.action.cancel',
      entityType: 'CapaAction',
      entityId: actionId,
      outcome: AuditOutcome.SUCCESS,
      metadata: { caseId, reason: dto.reason },
    });

    return updated;
  }

  /** Only a `COMPLETED` action can be validated. An `EFFECTIVE` outcome moves it to `VALIDATED`
   * (terminal); anything else reopens it to `IN_PROGRESS` — rework needed — rather than leaving
   * it stuck at `COMPLETED` with an outcome nobody acted on.
   *
   * Independence check added 2026-10-14 alongside the `CONTROL_OWNER`/`EFFECTIVENESS_REVIEWER`
   * role split: the action's owner cannot validate their own work — found live as a real gap
   * (nothing previously stopped it) while building `queuePendingValidation`'s "exclude
   * self-owned" filter, which was a dashboard-only convention until this check made it a real
   * server-side rule. Same segregation-of-duties shape as `ApprovalService.decide`'s
   * self-approval block — denial is audited the same way. */
  async validate(actor: AuthenticatedUser, caseId: string, actionId: string, dto: ValidateCapaActionDto): Promise<CapaValidation> {
    const action = await this.assertActionOnCase(actor, caseId, actionId);
    if (action.ownerId === actor.sub) {
      await this.auditService.record({
        tenantId: actor.tenantId,
        actorUserId: actor.sub,
        action: 'capa.action.validate',
        entityType: 'CapaAction',
        entityId: actionId,
        outcome: AuditOutcome.DENIED,
        metadata: { caseId, reason: 'self_validation_blocked' },
      });
      throw new ForbiddenException('The action owner cannot validate their own work');
    }
    if (action.status !== CapaActionStatus.COMPLETED) {
      throw new BadRequestException('Only a COMPLETED action can be validated');
    }

    const [validation] = await this.prisma.forCurrentTenant((tx) =>
      Promise.all([
        tx.capaValidation.create({
          data: { tenantId: actor.tenantId, capaActionId: actionId, outcome: dto.outcome, notes: dto.notes, validatedBy: actor.sub },
        }),
        tx.capaAction.update({
          where: { id: actionId },
          data: { status: dto.outcome === CapaValidationOutcome.EFFECTIVE ? CapaActionStatus.VALIDATED : CapaActionStatus.IN_PROGRESS },
        }),
      ]),
    );

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'capa.action.validate',
      entityType: 'CapaAction',
      entityId: actionId,
      outcome: AuditOutcome.SUCCESS,
      metadata: { caseId, validationOutcome: dto.outcome },
    });

    return validation;
  }

  async listValidations(actor: AuthenticatedUser, caseId: string, actionId: string): Promise<CapaValidation[]> {
    await this.assertActionOnCase(actor, caseId, actionId);
    return this.prisma.forCurrentTenant((tx) => tx.capaValidation.findMany({ where: { capaActionId: actionId }, orderBy: { validatedAt: 'desc' } }));
  }

  /** Cross-case "my corrective actions" queue for the Remediation/Control Owner dashboard (added
   * 2026-10-14) — every open/in-progress `CapaAction` this actor personally owns, across every
   * case they can access. */
  async queueOwned(actor: AuthenticatedUser): Promise<CapaAction[]> {
    const visibleCaseIds = await this.casesService.getVisibleCaseIds(actor);
    if (visibleCaseIds.length === 0) return [];
    return this.prisma.forCurrentTenant((tx) =>
      tx.capaAction.findMany({
        where: { caseId: { in: visibleCaseIds }, ownerId: actor.sub, status: { in: [CapaActionStatus.OPEN, CapaActionStatus.IN_PROGRESS] } },
        orderBy: { dueDate: 'asc' },
      }),
    );
  }

  /** Cross-case "validation inbox" for the Independent Effectiveness Reviewer dashboard (added
   * 2026-10-14) — every `COMPLETED` action awaiting validation, excluding actions this actor owns
   * themselves. That exclusion is independence, not a courtesy: `CapaService` has no server-side
   * block on validating your own action (unlike `ApprovalService.decide`'s self-approval block),
   * so the dashboard queue is what actually keeps a reviewer from reaching for their own work —
   * flagged here, not silently assumed to be enforced elsewhere. */
  async queuePendingValidation(actor: AuthenticatedUser): Promise<CapaAction[]> {
    const visibleCaseIds = await this.casesService.getVisibleCaseIds(actor);
    if (visibleCaseIds.length === 0) return [];
    return this.prisma.forCurrentTenant((tx) =>
      tx.capaAction.findMany({
        where: { caseId: { in: visibleCaseIds }, status: CapaActionStatus.COMPLETED, ownerId: { not: actor.sub } },
        orderBy: { completedAt: 'asc' },
      }),
    );
  }

  /** General cross-case register for the top-level "Remediation" nav page — every CAPA action
   * across every accessible case, not the owner/validator-personalized queues above. */
  async listAll(actor: AuthenticatedUser): Promise<(CapaAction & { case: { referenceCode: string; title: string } })[]> {
    const visibleCaseIds = await this.casesService.getVisibleCaseIds(actor);
    if (visibleCaseIds.length === 0) return [];
    return this.prisma.forCurrentTenant((tx) =>
      tx.capaAction.findMany({
        where: { caseId: { in: visibleCaseIds } },
        include: { case: { select: { referenceCode: true, title: true } } },
        orderBy: { dueDate: 'asc' },
      }),
    );
  }

  private async assertActionOnCase(actor: AuthenticatedUser, caseId: string, actionId: string): Promise<CapaAction> {
    await this.casesService.getById(actor, caseId);
    const action = await this.prisma.forCurrentTenant((tx) => tx.capaAction.findUnique({ where: { id: actionId } }));
    if (!action || action.caseId !== caseId) {
      throw new NotFoundException('CAPA action not found on this case');
    }
    return action;
  }
}
