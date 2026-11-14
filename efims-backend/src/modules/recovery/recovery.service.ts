import { BadRequestException, Injectable } from '@nestjs/common';
import { ApprovalAction, AuditOutcome, ContainmentStatus, LossEntry, Prisma, RecoveryEntry, WriteOffEntry } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user.interface';
import { AuditService } from '../audit/audit.service';
import { CasesService } from '../cases/cases.service';
import { MlGatewayService, RecoverySuggestion } from '../ml-gateway/ml-gateway.service';
import { ApprovalService } from '../workflow/approval.service';
import { PredictRecoveryDto } from './dto/predict-recovery.dto';
import { RecordLossDto } from './dto/record-loss.dto';
import { RecordRecoveryDto } from './dto/record-recovery.dto';
import { RecordWriteOffDto } from './dto/record-write-off.dto';

export interface RecoverySummary {
  totalLoss: string;
  totalRecovered: string;
  totalWrittenOff: string;
  outstanding: string;
  currency: 'NGN';
}

/**
 * Owns `LossEntry`/`RecoveryEntry`/`WriteOffEntry` — architecture.md's "loss/recovery ledger,
 * reconciliation". Every method calls `casesService.getById(actor, caseId)` first, same
 * discipline as every other case-scoped module in this codebase. `recordWriteOff` additionally
 * calls `approvalService.assertApproved` — a write-off can never be recorded without CD-04's
 * `LOSS_WRITE_OFF` approval already having been satisfied, same gate `ContainmentService.create`
 * uses for `CONTAINMENT`. All amounts assume NGN — this codebase's only currency precedent
 * (CD-02's `financialLossThresholdNgn`, CD-04's `amountBandsNgn`); mixed-currency aggregation is
 * out of scope, not silently mishandled — see schema.prisma's own doc comment on this module.
 */
@Injectable()
export class RecoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly casesService: CasesService,
    private readonly approvalService: ApprovalService,
    private readonly mlGatewayService: MlGatewayService,
  ) {}

  async recordLoss(actor: AuthenticatedUser, caseId: string, dto: RecordLossDto): Promise<LossEntry> {
    await this.casesService.getById(actor, caseId);

    const created = await this.prisma.forCurrentTenant((tx) =>
      tx.lossEntry.create({
        data: {
          tenantId: actor.tenantId,
          caseId,
          amount: dto.amount,
          category: dto.category,
          description: dto.description,
          recordedBy: actor.sub,
        },
      }),
    );

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'recovery.loss.record',
      entityType: 'LossEntry',
      entityId: created.id,
      outcome: AuditOutcome.SUCCESS,
      metadata: { caseId, amount: dto.amount, category: dto.category },
    });

    return created;
  }

  async listLosses(actor: AuthenticatedUser, caseId: string): Promise<LossEntry[]> {
    await this.casesService.getById(actor, caseId);
    return this.prisma.forCurrentTenant((tx) => tx.lossEntry.findMany({ where: { caseId }, orderBy: { recordedAt: 'desc' } }));
  }

  async recordRecovery(actor: AuthenticatedUser, caseId: string, dto: RecordRecoveryDto): Promise<RecoveryEntry> {
    await this.casesService.getById(actor, caseId);

    const created = await this.prisma.forCurrentTenant((tx) =>
      tx.recoveryEntry.create({
        data: {
          tenantId: actor.tenantId,
          caseId,
          amount: dto.amount,
          method: dto.method,
          description: dto.description,
          recordedBy: actor.sub,
        },
      }),
    );

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'recovery.recovery.record',
      entityType: 'RecoveryEntry',
      entityId: created.id,
      outcome: AuditOutcome.SUCCESS,
      metadata: { caseId, amount: dto.amount, method: dto.method },
    });

    return created;
  }

  async listRecoveries(actor: AuthenticatedUser, caseId: string): Promise<RecoveryEntry[]> {
    await this.casesService.getById(actor, caseId);
    return this.prisma.forCurrentTenant((tx) => tx.recoveryEntry.findMany({ where: { caseId }, orderBy: { recordedAt: 'desc' } }));
  }

  async recordWriteOff(actor: AuthenticatedUser, caseId: string, dto: RecordWriteOffDto): Promise<WriteOffEntry> {
    await this.casesService.getById(actor, caseId);
    await this.approvalService.assertApproved(caseId, ApprovalAction.LOSS_WRITE_OFF, dto.approvalId);

    const alreadyUsed = await this.prisma.forCurrentTenant((tx) =>
      tx.writeOffEntry.findUnique({ where: { approvalId: dto.approvalId } }),
    );
    if (alreadyUsed) {
      throw new BadRequestException('This approval has already been used to record a write-off');
    }

    const created = await this.prisma.forCurrentTenant((tx) =>
      tx.writeOffEntry.create({
        data: {
          tenantId: actor.tenantId,
          caseId,
          approvalId: dto.approvalId,
          amount: dto.amount,
          justification: dto.justification,
          recordedBy: actor.sub,
        },
      }),
    );

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'recovery.write_off.record',
      entityType: 'WriteOffEntry',
      entityId: created.id,
      outcome: AuditOutcome.SUCCESS,
      metadata: { caseId, amount: dto.amount, approvalId: dto.approvalId },
    });

    return created;
  }

  async listWriteOffs(actor: AuthenticatedUser, caseId: string): Promise<WriteOffEntry[]> {
    await this.casesService.getById(actor, caseId);
    return this.prisma.forCurrentTenant((tx) => tx.writeOffEntry.findMany({ where: { caseId }, orderBy: { recordedAt: 'desc' } }));
  }

  /** The EFIMS AI Service's recovery-probability predictor (`ml-gateway`'s new `predictRecovery`),
   * advisory-only — never writes anything, same discipline as `getSummary` below. Derives
   * `gross_actual_loss_ngn` and `containment_confirmed` from real case data rather than trusting
   * a client-supplied value for something already known; `severity`/`fraud_type`/`channel`/
   * `days_to_detection` come from the request body since nothing in EFIMS models them yet (see
   * `PredictRecoveryDto`'s own doc comment). */
  async predictRecovery(actor: AuthenticatedUser, caseId: string, dto: PredictRecoveryDto): Promise<RecoverySuggestion> {
    await this.casesService.getById(actor, caseId);

    const [lossAgg, confirmedContainment] = await this.prisma.forCurrentTenant((tx) =>
      Promise.all([
        tx.lossEntry.aggregate({ where: { caseId }, _sum: { amount: true } }),
        tx.containmentRequest.findFirst({ where: { caseId, status: ContainmentStatus.CONFIRMED } }),
      ]),
    );
    const grossActualLossNgn = (lossAgg._sum.amount ?? new Prisma.Decimal(0)).toNumber();

    const suggestion = await this.mlGatewayService.predictRecovery({
      caseId,
      grossActualLossNgn,
      severity: dto.severity,
      fraudType: dto.fraudType,
      channel: dto.channel,
      daysToDetection: dto.daysToDetection,
      containmentConfirmed: !!confirmedContainment,
    });

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'recovery.recovery_prediction.request',
      entityType: 'Case',
      entityId: caseId,
      outcome: AuditOutcome.SUCCESS,
      metadata: { recoveryProbability: suggestion.recoveryProbability, predictionId: suggestion.predictionId },
    });

    return suggestion;
  }

  /** Computed on every call, never stored — see schema.prisma's own doc comment on why
   * "reconciliation" is deliberately not a stored entity. */
  async getSummary(actor: AuthenticatedUser, caseId: string): Promise<RecoverySummary> {
    await this.casesService.getById(actor, caseId);

    const [lossAgg, recoveryAgg, writeOffAgg] = await this.prisma.forCurrentTenant((tx) =>
      Promise.all([
        tx.lossEntry.aggregate({ where: { caseId }, _sum: { amount: true } }),
        tx.recoveryEntry.aggregate({ where: { caseId }, _sum: { amount: true } }),
        tx.writeOffEntry.aggregate({ where: { caseId }, _sum: { amount: true } }),
      ]),
    );

    const totalLoss = lossAgg._sum.amount ?? new Prisma.Decimal(0);
    const totalRecovered = recoveryAgg._sum.amount ?? new Prisma.Decimal(0);
    const totalWrittenOff = writeOffAgg._sum.amount ?? new Prisma.Decimal(0);
    const outstanding = totalLoss.sub(totalRecovered).sub(totalWrittenOff);

    return {
      totalLoss: totalLoss.toFixed(2),
      totalRecovered: totalRecovered.toFixed(2),
      totalWrittenOff: totalWrittenOff.toFixed(2),
      outstanding: outstanding.toFixed(2),
      currency: 'NGN',
    };
  }

  /** Cross-case "needs attention" queue for the Recovery/Finance Officer dashboard (added
   * 2026-10-14) — every case with loss recorded and still-outstanding exposure (loss not yet
   * fully recovered or written off), across every case this actor can access. `groupBy` per
   * ledger table, not per-case `getSummary` calls, to stay one query per table regardless of how
   * many cases are visible. */
  async queue(actor: AuthenticatedUser): Promise<{ caseId: string; outstanding: string }[]> {
    const visibleCaseIds = await this.casesService.getVisibleCaseIds(actor);
    if (visibleCaseIds.length === 0) return [];

    const [lossByCase, recoveredByCase, writtenOffByCase] = await this.prisma.forCurrentTenant((tx) =>
      Promise.all([
        tx.lossEntry.groupBy({ by: ['caseId'], where: { caseId: { in: visibleCaseIds } }, _sum: { amount: true } }),
        tx.recoveryEntry.groupBy({ by: ['caseId'], where: { caseId: { in: visibleCaseIds } }, _sum: { amount: true } }),
        tx.writeOffEntry.groupBy({ by: ['caseId'], where: { caseId: { in: visibleCaseIds } }, _sum: { amount: true } }),
      ]),
    );

    const recoveredByCaseId = new Map(recoveredByCase.map((r) => [r.caseId, r._sum.amount ?? new Prisma.Decimal(0)]));
    const writtenOffByCaseId = new Map(writtenOffByCase.map((w) => [w.caseId, w._sum.amount ?? new Prisma.Decimal(0)]));

    return lossByCase
      .map((l) => {
        const loss = l._sum.amount ?? new Prisma.Decimal(0);
        const outstanding = loss
          .sub(recoveredByCaseId.get(l.caseId) ?? new Prisma.Decimal(0))
          .sub(writtenOffByCaseId.get(l.caseId) ?? new Prisma.Decimal(0));
        return { caseId: l.caseId, outstanding: outstanding.toFixed(2) };
      })
      .filter((row) => Number(row.outstanding) > 0)
      .sort((a, b) => Number(b.outstanding) - Number(a.outstanding));
  }

  /** General cross-case register for the top-level "Recoveries" nav page — every case with any
   * loss/recovery/write-off activity, not `queue()`'s "still outstanding" subset above. Same
   * per-table `groupBy` shape as `queue()`, just without the `outstanding > 0` filter. */
  async listAll(actor: AuthenticatedUser): Promise<
    { caseId: string; referenceCode: string; caseTitle: string; totalLoss: string; totalRecovered: string; totalWrittenOff: string; outstanding: string }[]
  > {
    const visibleCaseIds = await this.casesService.getVisibleCaseIds(actor);
    if (visibleCaseIds.length === 0) return [];

    const [lossByCase, recoveredByCase, writtenOffByCase, cases] = await this.prisma.forCurrentTenant((tx) =>
      Promise.all([
        tx.lossEntry.groupBy({ by: ['caseId'], where: { caseId: { in: visibleCaseIds } }, _sum: { amount: true } }),
        tx.recoveryEntry.groupBy({ by: ['caseId'], where: { caseId: { in: visibleCaseIds } }, _sum: { amount: true } }),
        tx.writeOffEntry.groupBy({ by: ['caseId'], where: { caseId: { in: visibleCaseIds } }, _sum: { amount: true } }),
        tx.case.findMany({ where: { id: { in: visibleCaseIds } }, select: { id: true, referenceCode: true, title: true } }),
      ]),
    );

    const caseById = new Map(cases.map((c) => [c.id, c]));
    const recoveredByCaseId = new Map(recoveredByCase.map((r) => [r.caseId, r._sum.amount ?? new Prisma.Decimal(0)]));
    const writtenOffByCaseId = new Map(writtenOffByCase.map((w) => [w.caseId, w._sum.amount ?? new Prisma.Decimal(0)]));

    return lossByCase
      .filter((l) => caseById.has(l.caseId))
      .map((l) => {
        const loss = l._sum.amount ?? new Prisma.Decimal(0);
        const recovered = recoveredByCaseId.get(l.caseId) ?? new Prisma.Decimal(0);
        const writtenOff = writtenOffByCaseId.get(l.caseId) ?? new Prisma.Decimal(0);
        const outstanding = loss.sub(recovered).sub(writtenOff);
        const caseInfo = caseById.get(l.caseId)!;
        return {
          caseId: l.caseId,
          referenceCode: caseInfo.referenceCode,
          caseTitle: caseInfo.title,
          totalLoss: loss.toFixed(2),
          totalRecovered: recovered.toFixed(2),
          totalWrittenOff: writtenOff.toFixed(2),
          outstanding: outstanding.toFixed(2),
        };
      })
      .sort((a, b) => Number(b.outstanding) - Number(a.outstanding));
  }
}
