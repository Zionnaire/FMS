import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.interface';
import { CASE_ROLES } from '../../common/constants/roles';
import { RecordLossDto } from './dto/record-loss.dto';
import { RecordRecoveryDto } from './dto/record-recovery.dto';
import { RecordWriteOffDto } from './dto/record-write-off.dto';
import { RecoveryService } from './recovery.service';

/** `CASE_ROLES` now lives in `common/constants/roles.ts`. No narrower gate on write-offs: the
 * consequential gate is the CD-04 `LOSS_WRITE_OFF` approval already required to record one — see
 * `RecoveryService.recordWriteOff`. */

@Controller('cases/:caseId/recovery')
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
}
