import { BadRequestException, Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuditOutcome, MlPredictionCapability } from '@prisma/client';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.interface';
import { EXCEPT_REPORTER_ROLES } from '../../common/constants/roles';
import { AuditService } from '../audit/audit.service';
import { DecidePredictionDto } from './dto/decide-prediction.dto';
import { ScoreAnomalyDto } from './dto/score-anomaly.dto';
import { MlGatewayService } from './ml-gateway.service';

/** Not case-scoped — this is a standalone investigative utility (the EFIMS AI Service's
 * transaction anomaly scorer), not an action on any entity EFIMS itself models. Gated
 * `EXCEPT_REPORTER_ROLES`, same "everyone except the reporter role" convention the frontend
 * sidenav already uses for non-case-browsing operational tools. Every call is still audited —
 * `entityType: 'AdHocQuery'` with no real entity id, since there's nothing in EFIMS to tie a
 * one-off scoring request to. */
@Controller('ml-gateway')
export class MlGatewayController {
  constructor(
    private readonly mlGatewayService: MlGatewayService,
    private readonly auditService: AuditService,
  ) {}

  @Get('health')
  getHealth() {
    return this.mlGatewayService.getMlServiceHealth();
  }

  @Post('anomaly/score')
  @UseGuards(RolesGuard)
  @Roles(...EXCEPT_REPORTER_ROLES)
  async scoreAnomaly(@CurrentUser() actor: AuthenticatedUser, @Body() dto: ScoreAnomalyDto) {
    const result = await this.mlGatewayService.scoreAnomaly(
      {
        transactionId: dto.transactionId,
        amountNgn: dto.amountNgn,
        channel: dto.channel,
        transactionType: dto.transactionType,
        velocityIndicator: dto.velocityIndicator,
        ipRiskScore: dto.ipRiskScore,
        deviceRiskScore: dto.deviceRiskScore,
        isReversal: dto.isReversal,
        isChargeback: dto.isChargeback,
        accountRiskRating: dto.accountRiskRating,
      },
      { tenantId: actor.tenantId, entityType: 'Transaction', entityId: dto.transactionId, requestedBy: actor.sub },
    );

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'ml_gateway.anomaly_score.request',
      entityType: 'AdHocQuery',
      entityId: dto.transactionId,
      outcome: AuditOutcome.SUCCESS,
      metadata: { anomalyScore: result.anomalyScore, isSuspicious: result.isSuspicious, predictionId: result.predictionId },
    });

    return result;
  }

  /** The vendor's v1.0 integration spec, rule #3: "record whether the analyst accepted or
   * overrode it." **ANOMALY predictions only** — nothing in EFIMS models a `Transaction`, so
   * there's no entity-level access check to run, unlike SEVERITY (decided via
   * `TriageController`'s own `.../suggestion/:predictionId/decision`, which checks the
   * incident's compartment/clearance first) or RECOVERY (via `RecoveryController`'s
   * `.../predict/:predictionId/decision`, same reasoning for the case). A security review
   * (2026-11-19) flagged that this route previously accepted any capability with only a
   * tenant+role check — fixed by rejecting anything that isn't ANOMALY here. */
  @Patch('predictions/:predictionId/decision')
  @UseGuards(RolesGuard)
  @Roles(...EXCEPT_REPORTER_ROLES)
  async decidePrediction(@CurrentUser() actor: AuthenticatedUser, @Param('predictionId') predictionId: string, @Body() dto: DecidePredictionDto) {
    const record = await this.mlGatewayService.getPredictionRecord(actor, predictionId);
    if (record.capability !== MlPredictionCapability.ANOMALY) {
      throw new BadRequestException(
        `This prediction is a ${record.capability} suggestion — decide it through its own entity-scoped route, not this one.`,
      );
    }
    await this.mlGatewayService.decidePrediction(actor, predictionId, dto.decision);

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'ml_gateway.prediction.decide',
      entityType: 'MlPredictionRecord',
      entityId: predictionId,
      outcome: AuditOutcome.SUCCESS,
      metadata: { decision: dto.decision },
    });

    return { predictionId, decision: dto.decision };
  }
}
