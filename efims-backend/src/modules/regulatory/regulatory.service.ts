import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ApprovalAction, AuditOutcome, ObligationStatus, RegulatoryObligation, RegulatorySubmission } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user.interface';
import { AuditService } from '../audit/audit.service';
import { CasesService } from '../cases/cases.service';
import { ApprovalService } from '../workflow/approval.service';
import { AcknowledgeObligationDto } from './dto/acknowledge-obligation.dto';
import { CreateObligationDto } from './dto/create-obligation.dto';
import { SubmitObligationDto } from './dto/submit-obligation.dto';
import { WaiveObligationDto } from './dto/waive-obligation.dto';

/**
 * Owns `RegulatoryObligation`/`RegulatorySubmission` — architecture.md's "obligations register,
 * submissions", the last module in the MVP build order. Every method calls
 * `casesService.getById(actor, caseId)` first, same discipline as every other case-scoped module
 * in this codebase. `submit` additionally calls `approvalService.assertApproved` — a submission
 * can never be recorded without CD-04's `REGULATORY_SUBMISSION` approval already having been
 * satisfied, the same gate `ContainmentService.create`/`RecoveryService.recordWriteOff` use for
 * their own CD-04 actions (non-negotiable #4: no autonomous regulatory submission without a
 * human approval step). No real regulator-facing integration exists — `submit`/`acknowledge` are
 * the seam a real filing system or inbound webhook would call, exercised manually for now, the
 * same "build the seam now" pattern `containment`'s confirm/reject already established.
 */
@Injectable()
export class RegulatoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly casesService: CasesService,
    private readonly approvalService: ApprovalService,
  ) {}

  async createObligation(actor: AuthenticatedUser, caseId: string, dto: CreateObligationDto): Promise<RegulatoryObligation> {
    await this.casesService.getById(actor, caseId);

    const created = await this.prisma.forCurrentTenant((tx) =>
      tx.regulatoryObligation.create({
        data: {
          tenantId: actor.tenantId,
          caseId,
          obligationType: dto.obligationType,
          description: dto.description,
          regulatorName: dto.regulatorName,
          deadline: new Date(dto.deadline),
          identifiedBy: actor.sub,
        },
      }),
    );

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'regulatory.obligation.create',
      entityType: 'RegulatoryObligation',
      entityId: created.id,
      outcome: AuditOutcome.SUCCESS,
      metadata: { caseId, obligationType: created.obligationType, deadline: created.deadline },
    });

    return created;
  }

  async listObligations(actor: AuthenticatedUser, caseId: string, status?: ObligationStatus): Promise<RegulatoryObligation[]> {
    await this.casesService.getById(actor, caseId);
    return this.prisma.forCurrentTenant((tx) =>
      tx.regulatoryObligation.findMany({ where: { caseId, status }, orderBy: { deadline: 'asc' } }),
    );
  }

  async getById(actor: AuthenticatedUser, caseId: string, obligationId: string) {
    await this.casesService.getById(actor, caseId);
    const obligation = await this.prisma.forCurrentTenant((tx) =>
      tx.regulatoryObligation.findUnique({ where: { id: obligationId }, include: { submissions: { orderBy: { submittedAt: 'desc' } } } }),
    );
    if (!obligation || obligation.caseId !== caseId) {
      throw new NotFoundException('Regulatory obligation not found on this case');
    }
    return obligation;
  }

  async submit(actor: AuthenticatedUser, caseId: string, obligationId: string, dto: SubmitObligationDto): Promise<RegulatorySubmission> {
    const obligation = await this.assertObligationOnCase(actor, caseId, obligationId);
    if (obligation.status !== ObligationStatus.PENDING) {
      throw new BadRequestException(`This obligation is ${obligation.status.toLowerCase()}, not PENDING`);
    }
    await this.approvalService.assertApproved(caseId, ApprovalAction.REGULATORY_SUBMISSION, dto.approvalId);

    const alreadyUsed = await this.prisma.forCurrentTenant((tx) =>
      tx.regulatorySubmission.findUnique({ where: { approvalId: dto.approvalId } }),
    );
    if (alreadyUsed) {
      throw new BadRequestException('This approval has already been used to record a submission');
    }

    const [submission] = await this.prisma.forCurrentTenant((tx) =>
      Promise.all([
        tx.regulatorySubmission.create({
          data: {
            tenantId: actor.tenantId,
            obligationId,
            approvalId: dto.approvalId,
            referenceNumber: dto.referenceNumber,
            notes: dto.notes,
            submittedBy: actor.sub,
          },
        }),
        tx.regulatoryObligation.update({ where: { id: obligationId }, data: { status: ObligationStatus.SUBMITTED } }),
      ]),
    );

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'regulatory.obligation.submit',
      entityType: 'RegulatoryObligation',
      entityId: obligationId,
      outcome: AuditOutcome.SUCCESS,
      metadata: { caseId, approvalId: dto.approvalId, referenceNumber: dto.referenceNumber },
    });

    return submission;
  }

  async acknowledge(actor: AuthenticatedUser, caseId: string, obligationId: string, dto: AcknowledgeObligationDto): Promise<RegulatoryObligation> {
    const obligation = await this.assertObligationOnCase(actor, caseId, obligationId);
    if (obligation.status !== ObligationStatus.SUBMITTED) {
      throw new BadRequestException(`This obligation is ${obligation.status.toLowerCase()}, not SUBMITTED`);
    }

    const updated = await this.prisma.forCurrentTenant((tx) =>
      tx.regulatoryObligation.update({
        where: { id: obligationId },
        data: { status: ObligationStatus.ACKNOWLEDGED, acknowledgedRef: dto.acknowledgedRef, acknowledgedAt: new Date() },
      }),
    );

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'regulatory.obligation.acknowledge',
      entityType: 'RegulatoryObligation',
      entityId: obligationId,
      outcome: AuditOutcome.SUCCESS,
      metadata: { caseId, acknowledgedRef: dto.acknowledgedRef },
    });

    return updated;
  }

  async waive(actor: AuthenticatedUser, caseId: string, obligationId: string, dto: WaiveObligationDto): Promise<RegulatoryObligation> {
    const obligation = await this.assertObligationOnCase(actor, caseId, obligationId);
    if (obligation.status !== ObligationStatus.PENDING) {
      throw new BadRequestException(`This obligation is ${obligation.status.toLowerCase()}, not PENDING`);
    }

    const updated = await this.prisma.forCurrentTenant((tx) =>
      tx.regulatoryObligation.update({
        where: { id: obligationId },
        data: { status: ObligationStatus.WAIVED, waivedReason: dto.reason, waivedBy: actor.sub, waivedAt: new Date() },
      }),
    );

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'regulatory.obligation.waive',
      entityType: 'RegulatoryObligation',
      entityId: obligationId,
      outcome: AuditOutcome.SUCCESS,
      metadata: { caseId, reason: dto.reason },
    });

    return updated;
  }

  /** General cross-case register for the top-level "Regulatory reports" nav page — every
   * obligation across every accessible case, same discipline as `EvidenceService.listAll`/
   * `ContainmentService.listAll`. */
  async listAll(actor: AuthenticatedUser): Promise<(RegulatoryObligation & { case: { referenceCode: string; title: string } })[]> {
    const visibleCaseIds = await this.casesService.getVisibleCaseIds(actor);
    if (visibleCaseIds.length === 0) return [];

    return this.prisma.forCurrentTenant((tx) =>
      tx.regulatoryObligation.findMany({
        where: { caseId: { in: visibleCaseIds } },
        include: { case: { select: { referenceCode: true, title: true } } },
        orderBy: { deadline: 'asc' },
      }),
    );
  }

  private async assertObligationOnCase(actor: AuthenticatedUser, caseId: string, obligationId: string): Promise<RegulatoryObligation> {
    await this.casesService.getById(actor, caseId);
    const obligation = await this.prisma.forCurrentTenant((tx) => tx.regulatoryObligation.findUnique({ where: { id: obligationId } }));
    if (!obligation || obligation.caseId !== caseId) {
      throw new NotFoundException('Regulatory obligation not found on this case');
    }
    return obligation;
  }
}
