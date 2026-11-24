import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.interface';
import { CASE_ROLES, EXCEPT_REPORTER_ROLES } from '../../common/constants/roles';
import { DecidePredictionDto } from '../ml-gateway/dto/decide-prediction.dto';
import { PredictRecoveryDto } from './dto/predict-recovery.dto';
import { RecordLossDto } from './dto/record-loss.dto';
import { RecordRecoveryDto } from './dto/record-recovery.dto';
import { RecordWriteOffDto } from './dto/record-write-off.dto';
import { RecoveryService } from './recovery.service';

/** `CASE_ROLES` now lives in `common/constants/roles.ts`. No narrower gate on write-offs: the
 * consequential gate is the CD-04 `LOSS_WRITE_OFF` approval already required to record one — see
 * `RecoveryService.recordWriteOff`. */

/** Class-level `@Roles(...EXCEPT_REPORTER_ROLES)` added 2026-11-24 — see `CasesController`'s own
 * doc comment for the full story. This controller's `losses`/`recoveries`/`write-offs`/`summary`
 * GET routes had no role gate at all; only the separate `RecoveryQueueController` below had
 * already picked up `EXCEPT_REPORTER_ROLES` at some earlier point, never propagated here. */
@Controller('cases/:caseId/recovery')
@UseGuards(RolesGuard)
@Roles(...EXCEPT_REPORTER_ROLES)
export class RecoveryController {
  constructor(private readonly recoveryService: RecoveryService) {}

  @Post('losses')
  @UseGuards(RolesGuard)
  @Roles(...CASE_ROLES)
  recordLoss(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: RecordLossDto,
  ) {
    return this.recoveryService.recordLoss(actor, caseId, dto);
  }

  @Get('losses')
  listLosses(@CurrentUser() actor: AuthenticatedUser, @Param('caseId', ParseUUIDPipe) caseId: string) {
    return this.recoveryService.listLosses(actor, caseId);
  }

  @Post('recoveries')
  @UseGuards(RolesGuard)
  @Roles(...CASE_ROLES)
  recordRecovery(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: RecordRecoveryDto,
  ) {
    return this.recoveryService.recordRecovery(actor, caseId, dto);
  }

  @Get('recoveries')
  listRecoveries(@CurrentUser() actor: AuthenticatedUser, @Param('caseId', ParseUUIDPipe) caseId: string) {
    return this.recoveryService.listRecoveries(actor, caseId);
  }

  @Post('write-offs')
  @UseGuards(RolesGuard)
  @Roles(...CASE_ROLES)
  recordWriteOff(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: RecordWriteOffDto,
  ) {
    return this.recoveryService.recordWriteOff(actor, caseId, dto);
  }

  @Get('write-offs')
  listWriteOffs(@CurrentUser() actor: AuthenticatedUser, @Param('caseId', ParseUUIDPipe) caseId: string) {
    return this.recoveryService.listWriteOffs(actor, caseId);
  }

  @Get('summary')
  getSummary(@CurrentUser() actor: AuthenticatedUser, @Param('caseId', ParseUUIDPipe) caseId: string) {
    return this.recoveryService.getSummary(actor, caseId);
  }

  @Post('predict')
  @UseGuards(RolesGuard)
  @Roles(...CASE_ROLES)
  predictRecovery(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: PredictRecoveryDto,
  ) {
    return this.recoveryService.predictRecovery(actor, caseId, dto);
  }

  /** The EFIMS AI Service's v1.0 integration spec, rule #3 — "record whether the analyst
   * accepted or overrode it." Entity-scoped (nested under this case) specifically so the case's
   * own access check runs before anyone can decide a prediction about it — see
   * `RecoveryService.decideRecoveryPrediction`'s own doc comment. Gated `EXCEPT_REPORTER_ROLES`,
   * same breadth as `MlGatewayController`'s anomaly-only decide route, rather than `CASE_ROLES`
   * — deciding is a lighter action than requesting the prediction itself. */
  @Patch('predict/:predictionId/decision')
  @UseGuards(RolesGuard)
  @Roles(...EXCEPT_REPORTER_ROLES)
  async decideRecoveryPrediction(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('predictionId') predictionId: string,
    @Body() dto: DecidePredictionDto,
  ) {
    await this.recoveryService.decideRecoveryPrediction(actor, caseId, predictionId, dto.decision);
    return { predictionId, decision: dto.decision };
  }
}

/** Separate, root-level controller for the Recovery/Finance Officer dashboard's cross-case queue
 * (added 2026-10-14) — same reasoning as `EvidenceQueueController`. */
@Controller('recovery')
export class RecoveryQueueController {
  constructor(private readonly recoveryService: RecoveryService) {}

  @Get('queue')
  queue(@CurrentUser() actor: AuthenticatedUser) {
    return this.recoveryService.queue(actor);
  }

  /** General register for the top-level Recoveries nav page — every case with financial
   * activity, not `queue()`'s "still outstanding" subset. */
  @Get()
  listAll(@CurrentUser() actor: AuthenticatedUser) {
    return this.recoveryService.listAll(actor);
  }
}
