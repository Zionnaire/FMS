import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ApprovalAction, AuditOutcome, ContainmentRequest, ContainmentStatus } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user.interface';
import { AuditService } from '../audit/audit.service';
import { CasesService } from '../cases/cases.service';
import { ApprovalService } from '../workflow/approval.service';
import { CancelContainmentDto } from './dto/cancel-containment.dto';
import { ConfirmContainmentDto } from './dto/confirm-containment.dto';
import { RejectContainmentDto } from './dto/reject-containment.dto';
import { RequestContainmentDto } from './dto/request-containment.dto';

/**
 * Owns `ContainmentRequest` — architecture.md's "action requests, confirmations", built directly
 * around CLAUDE.md non-negotiable #8: EFIMS only ever requests a containment action and waits;
 * it never performs one, and never shows a case as contained until a positive confirmation comes
 * back. There is no real integration with any source system (core banking, card processor, etc.)
 * in this codebase — `.../confirm` and `.../reject` are the seam a real webhook/callback would
 * call once one exists, exercised manually for now, the same "build the seam now, wire in the
 * real thing later" pattern `notifications`' stubbed external channels already use. Every method
 * calls `casesService.getById(actor, caseId)` first, same discipline as `investigations`/
 * `evidence`; `create` additionally calls `approvalService.assertApproved` — a containment
 * request can never be created without CD-04's approval gate already having been satisfied.
 */
@Injectable()
export class ContainmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly casesService: CasesService,
    private readonly approvalService: ApprovalService,
  ) {}

  async create(actor: AuthenticatedUser, caseId: string, dto: RequestContainmentDto): Promise<ContainmentRequest> {
    await this.casesService.getById(actor, caseId);
    await this.approvalService.assertApproved(caseId, ApprovalAction.CONTAINMENT, dto.approvalId);

    // One approved CONTAINMENT request authorizes exactly one containment action — see the
    // `@unique` doc comment on `ContainmentRequest.approvalId` in schema.prisma. Checked here for
    // a clean 400 instead of surfacing a raw Prisma unique-constraint violation; the DB constraint
    // is still the actual backstop against a race between two concurrent creates.
    const alreadyUsed = await this.prisma.forCurrentTenant((tx) =>
      tx.containmentRequest.findUnique({ where: { approvalId: dto.approvalId } }),
    );
    if (alreadyUsed) {
      throw new BadRequestException('This approval has already been used to request a containment action');
    }

    const created = await this.prisma.forCurrentTenant((tx) =>
      tx.containmentRequest.create({
        data: {
          tenantId: actor.tenantId,
          caseId,
          approvalId: dto.approvalId,
          actionType: dto.actionType,
          targetDescription: dto.targetDescription,
          rationale: dto.rationale,
          requestedBy: actor.sub,
        },
      }),
    );

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'containment.request.create',
      entityType: 'ContainmentRequest',
      entityId: created.id,
      outcome: AuditOutcome.SUCCESS,
      metadata: { caseId, actionType: created.actionType, approvalId: dto.approvalId },
    });

    return created;
  }

  async list(actor: AuthenticatedUser, caseId: string): Promise<ContainmentRequest[]> {
    await this.casesService.getById(actor, caseId);
    return this.prisma.forCurrentTenant((tx) =>
      tx.containmentRequest.findMany({ where: { caseId }, orderBy: { requestedAt: 'desc' } }),
    );
  }

  async getById(actor: AuthenticatedUser, caseId: string, requestId: string): Promise<ContainmentRequest> {
    await this.casesService.getById(actor, caseId);
    const request = await this.assertRequestOnCase(caseId, requestId);
    return request;
  }

  async confirm(actor: AuthenticatedUser, caseId: string, requestId: string, dto: ConfirmContainmentDto): Promise<ContainmentRequest> {
    await this.casesService.getById(actor, caseId);
    const request = await this.assertRequestOnCase(caseId, requestId);
    this.assertStillRequested(request);

    const updated = await this.prisma.forCurrentTenant((tx) =>
      tx.containmentRequest.update({
        where: { id: requestId },
        data: { status: ContainmentStatus.CONFIRMED, confirmationRef: dto.confirmationRef, confirmedAt: new Date() },
      }),
    );

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'containment.request.confirm',
      entityType: 'ContainmentRequest',
      entityId: requestId,
      outcome: AuditOutcome.SUCCESS,
      metadata: { caseId, confirmationRef: dto.confirmationRef },
    });

    return updated;
  }

  async reject(actor: AuthenticatedUser, caseId: string, requestId: string, dto: RejectContainmentDto): Promise<ContainmentRequest> {
    await this.casesService.getById(actor, caseId);
    const request = await this.assertRequestOnCase(caseId, requestId);
    this.assertStillRequested(request);

    const updated = await this.prisma.forCurrentTenant((tx) =>
      tx.containmentRequest.update({
        where: { id: requestId },
        data: { status: ContainmentStatus.REJECTED, rejectionReason: dto.reason, rejectedAt: new Date() },
      }),
    );

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'containment.request.reject',
      entityType: 'ContainmentRequest',
      entityId: requestId,
      outcome: AuditOutcome.SUCCESS,
      metadata: { caseId, reason: dto.reason },
    });

    return updated;
  }

  async cancel(actor: AuthenticatedUser, caseId: string, requestId: string, dto: CancelContainmentDto): Promise<ContainmentRequest> {
    await this.casesService.getById(actor, caseId);
    const request = await this.assertRequestOnCase(caseId, requestId);
    this.assertStillRequested(request);

    const updated = await this.prisma.forCurrentTenant((tx) =>
      tx.containmentRequest.update({
        where: { id: requestId },
        data: { status: ContainmentStatus.CANCELLED, cancellationReason: dto.reason, cancelledBy: actor.sub, cancelledAt: new Date() },
      }),
    );

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'containment.request.cancel',
      entityType: 'ContainmentRequest',
      entityId: requestId,
      outcome: AuditOutcome.SUCCESS,
      metadata: { caseId, reason: dto.reason },
    });

    return updated;
  }

  /** General cross-case register for the top-level "Containment" nav page — every containment
   * request across every accessible case, same shape/discipline as `EvidenceService.listAll`/
   * `CapaService.listAll`. */
  async listAll(actor: AuthenticatedUser): Promise<(ContainmentRequest & { case: { referenceCode: string; title: string } })[]> {
    const visibleCaseIds = await this.casesService.getVisibleCaseIds(actor);
    if (visibleCaseIds.length === 0) return [];

    return this.prisma.forCurrentTenant((tx) =>
      tx.containmentRequest.findMany({
        where: { caseId: { in: visibleCaseIds } },
        include: { case: { select: { referenceCode: true, title: true } } },
        orderBy: { requestedAt: 'desc' },
      }),
    );
  }

  private async assertRequestOnCase(caseId: string, requestId: string): Promise<ContainmentRequest> {
    const request = await this.prisma.forCurrentTenant((tx) => tx.containmentRequest.findUnique({ where: { id: requestId } }));
    if (!request || request.caseId !== caseId) {
      throw new NotFoundException('Containment request not found on this case');
    }
    return request;
  }

  private assertStillRequested(request: ContainmentRequest): void {
    if (request.status !== ContainmentStatus.REQUESTED) {
      throw new BadRequestException(`This containment request is already ${request.status.toLowerCase()}`);
    }
  }
}
