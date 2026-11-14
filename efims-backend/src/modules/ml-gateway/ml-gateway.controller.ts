import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuditOutcome } from '@prisma/client';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.interface';
import { EXCEPT_REPORTER_ROLES } from '../../common/constants/roles';
import { AuditService } from '../audit/audit.service';
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
    const result = await this.mlGatewayService.scoreAnomaly({
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
    });

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
}
