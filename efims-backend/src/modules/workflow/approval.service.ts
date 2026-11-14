import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ApprovalAction, ApprovalRequest, ApprovalStatus, AuditOutcome, Role, SeverityBand } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user.interface';
import {
  APPROVAL_DECIDED_EVENT,
  APPROVAL_REQUESTED_EVENT,
  ApprovalDecidedEvent,
  ApprovalRequestedEvent,
} from '../../common/events/domain-events';
import { AuditService } from '../audit/audit.service';
import { UsersService } from '../identity/users.service';
import { DecideApprovalDto } from './dto/decide-approval.dto';
import { RequestApprovalDto } from './dto/request-approval.dto';

/**
 * CD-04's approval matrix (docs/configuration-decisions.md), hardcoded here rather than read
 * from `ConfigurationEntry` — its approver names ("CRO/Executive", "Case Owner + peer review")
 * don't map 1:1 onto the `Role` enum, the same gap `configuration`'s own README flags for CD-04
 * mutation-route gating. Approximations made explicit here:
 *   - "CRO/Executive" -> EXECUTIVE
 *   - "Compliance/MLRO" -> COMPLIANCE_MLRO, "+ Legal" -> also LEGAL_COUNSEL
 *   - "Case Owner + peer review" -> CASE_OWNER and TEAM_LEAD (a team lead standing in for "a
 *     peer", since "peer review" names a process, not a role)
 * `ADMIN` can always decide, on top of this table, as the MVP stand-in for "whoever administers
 * the approval process" — same pattern as `WhistleblowerVaultService`'s allow-list.
 */
const APPROVAL_MATRIX: Record<ApprovalAction, Record<SeverityBand, Role[]>> = {
  [ApprovalAction.CONTAINMENT]: {
    [SeverityBand.S1_S2]: [Role.TEAM_LEAD, Role.FRAUD_RISK_MANAGER],
    [SeverityBand.S3_S4]: [Role.TEAM_LEAD],
  },
  [ApprovalAction.LOSS_WRITE_OFF]: {
    [SeverityBand.S1_S2]: [Role.EXECUTIVE],
    [SeverityBand.S3_S4]: [Role.FRAUD_RISK_MANAGER],
  },
  [ApprovalAction.REGULATORY_SUBMISSION]: {
    [SeverityBand.S1_S2]: [Role.COMPLIANCE_MLRO, Role.LEGAL_COUNSEL],
    [SeverityBand.S3_S4]: [Role.COMPLIANCE_MLRO],
  },
  [ApprovalAction.CASE_CLOSURE]: {
    [SeverityBand.S1_S2]: [Role.FRAUD_RISK_MANAGER],
    [SeverityBand.S3_S4]: [Role.CASE_OWNER, Role.TEAM_LEAD],
  },
};

/**
 * Owns `ApprovalRequest`. Deliberately does NOT check case access itself (no `IncidentsService`-
 * style `getById` here) and does NOT import `CasesModule` — every route that reaches this
 * service lives on `CasesController`'s side (see `cases`' README section), which already ran
 * `CasesService.getById`'s full 7-condition check before delegating here. Keeping this module
 * standalone (no dependency on `cases`) is what lets `cases` depend on `workflow` — for the
 * Case-closure approval gate in `CasesService.updateStatus` — without a circular module import.
 */
@Injectable()
export class ApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly usersService: UsersService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async request(actor: AuthenticatedUser, caseId: string, dto: RequestApprovalDto): Promise<ApprovalRequest> {
    const created = await this.prisma.forCurrentTenant((tx) =>
      tx.approvalRequest.create({
        data: {
          tenantId: actor.tenantId,
          caseId,
          action: dto.action,
          severityBand: dto.severityBand,
          requestNotes: dto.requestNotes,
          requestedBy: actor.sub,
        },
      }),
    );

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'workflow.approval.request',
      entityType: 'ApprovalRequest',
      entityId: created.id,
      outcome: AuditOutcome.SUCCESS,
      metadata: { caseId, action: dto.action, severityBand: dto.severityBand },
    });

    // Sequential, not Promise.all — concurrent transactions against a remote database proved
    // costly the hard way earlier in this project (see ConfigurationService.getAllCurrent's own
    // doc comment); authorizedRoles is at most 2-3 entries, so the extra round-trip cost here is
    // negligible either way, but there's no reason to reintroduce that risk for no benefit.
    const authorizedRoles = APPROVAL_MATRIX[dto.action][dto.severityBand];
    const notifyUserIds: string[] = [];
    for (const role of authorizedRoles) {
      notifyUserIds.push(...(await this.usersService.listActiveUserIdsByRole(role)));
    }
    const uniqueNotifyUserIds = [...new Set(notifyUserIds)].filter((userId) => userId !== actor.sub);
    this.eventEmitter.emit(APPROVAL_REQUESTED_EVENT, {
      tenantId: actor.tenantId,
      approvalId: created.id,
      caseId,
      action: dto.action,
      severityBand: dto.severityBand,
      requestedBy: actor.sub,
      notifyUserIds: uniqueNotifyUserIds,
    } satisfies ApprovalRequestedEvent);

    return created;
  }

  async list(caseId: string): Promise<ApprovalRequest[]> {
    return this.prisma.forCurrentTenant((tx) =>
      tx.approvalRequest.findMany({ where: { caseId }, orderBy: { requestedAt: 'desc' } }),
    );
  }

  async decide(actor: AuthenticatedUser, caseId: string, approvalId: string, dto: DecideApprovalDto): Promise<ApprovalRequest> {
    const request = await this.prisma.forCurrentTenant((tx) => tx.approvalRequest.findUnique({ where: { id: approvalId } }));
    if (!request || request.caseId !== caseId) {
      throw new NotFoundException('Approval request not found on this case');
    }
    if (request.status !== ApprovalStatus.PENDING) {
      throw new BadRequestException(`Request is already ${request.status.toLowerCase()}`);
    }
    if (request.requestedBy === actor.sub) {
      await this.auditService.record({
        tenantId: actor.tenantId,
        actorUserId: actor.sub,
        action: 'workflow.approval.decide',
        entityType: 'ApprovalRequest',
        entityId: approvalId,
        outcome: AuditOutcome.DENIED,
        metadata: { reason: 'self_approval_blocked', action: request.action, severityBand: request.severityBand },
      });
      throw new ForbiddenException('The requester cannot decide their own approval request');
    }

    const authorizedRoles = APPROVAL_MATRIX[request.action][request.severityBand];
    if (!authorizedRoles.includes(actor.role) && actor.role !== Role.ADMIN) {
      await this.auditService.record({
        tenantId: actor.tenantId,
        actorUserId: actor.sub,
        action: 'workflow.approval.decide',
        entityType: 'ApprovalRequest',
        entityId: approvalId,
        outcome: AuditOutcome.DENIED,
        metadata: { reason: 'role_not_authorized', action: request.action, severityBand: request.severityBand },
      });
      throw new ForbiddenException('Not authorized to decide this approval request');
    }

    const status = dto.approved ? ApprovalStatus.APPROVED : ApprovalStatus.REJECTED;
    const updated = await this.prisma.forCurrentTenant((tx) =>
      tx.approvalRequest.update({
        where: { id: approvalId },
        data: { status, decidedBy: actor.sub, decidedAt: new Date(), decisionNotes: dto.decisionNotes },
      }),
    );

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'workflow.approval.decide',
      entityType: 'ApprovalRequest',
      entityId: approvalId,
      outcome: AuditOutcome.SUCCESS,
      metadata: { status },
    });

    this.eventEmitter.emit(APPROVAL_DECIDED_EVENT, {
      tenantId: actor.tenantId,
      approvalId,
      caseId,
      action: request.action,
      status,
      decidedBy: actor.sub,
      requestedBy: request.requestedBy,
    } satisfies ApprovalDecidedEvent);

    return updated;
  }

  /** General cross-case register for the top-level "Approvals" nav page — every approval request
   * across every accessible case. Takes the actor's visible case IDs as a parameter rather than
   * computing them itself: this service deliberately has no `CasesService` dependency (see the
   * class doc comment above on why), so the one new root-level controller for this route lives in
   * `CasesModule` instead — it already legitimately has both `CasesService` and `ApprovalService`
   * via its existing `WorkflowModule` import — and calls `getVisibleCaseIds` there before handing
   * the result to this method. */
  async listAll(visibleCaseIds: string[]): Promise<(ApprovalRequest & { case: { referenceCode: string; title: string } })[]> {
    if (visibleCaseIds.length === 0) return [];
    return this.prisma.forCurrentTenant((tx) =>
      tx.approvalRequest.findMany({
        where: { caseId: { in: visibleCaseIds } },
        include: { case: { select: { referenceCode: true, title: true } } },
        orderBy: { requestedAt: 'desc' },
      }),
    );
  }

  /** Used by `CasesService.updateStatus` to validate a specific approval before allowing a
   * transition to CLOSED — the one concrete integration point this module wires up (see the
   * module doc comment in schema.prisma on why this isn't a general state-machine engine). */
  async assertApproved(caseId: string, action: ApprovalAction, approvalId: string): Promise<void> {
    const request = await this.prisma.forCurrentTenant((tx) => tx.approvalRequest.findUnique({ where: { id: approvalId } }));
    if (!request || request.caseId !== caseId || request.action !== action) {
      throw new BadRequestException('approvalId does not reference a matching approval request for this case');
    }
    if (request.status !== ApprovalStatus.APPROVED) {
      throw new BadRequestException(`Referenced approval request is ${request.status.toLowerCase()}, not APPROVED`);
    }
  }
}
