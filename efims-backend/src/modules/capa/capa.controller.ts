import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { CapaActionStatus } from '@prisma/client';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.interface';
import { CASE_ROLES, CAPA_VALIDATION_ROLES, EXCEPT_REPORTER_ROLES } from '../../common/constants/roles';
import { CancelCapaActionDto } from './dto/cancel-capa-action.dto';
import { CompleteCapaActionDto } from './dto/complete-capa-action.dto';
import { CreateCapaActionDto } from './dto/create-capa-action.dto';
import { CreateRootCauseDto } from './dto/create-root-cause.dto';
import { ValidateCapaActionDto } from './dto/validate-capa-action.dto';
import { CapaService } from './capa.service';

/** Class-level `@Roles(...EXCEPT_REPORTER_ROLES)` added 2026-11-24 — see `CasesController`'s own
 * doc comment for the full story: read routes in this family of controllers had no role gate at
 * all, found live via an RBAC audit. Method-level `@Roles(...CASE_ROLES)`/`CAPA_VALIDATION_ROLES`
 * below still take precedence (narrower subsets, `RolesGuard` checks method before class). */
@Controller('cases/:caseId')
@UseGuards(RolesGuard)
@Roles(...EXCEPT_REPORTER_ROLES)
export class CapaController {
  constructor(private readonly capaService: CapaService) {}

  @Post('root-causes')
  @UseGuards(RolesGuard)
  @Roles(...CASE_ROLES)
  createRootCause(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: CreateRootCauseDto,
  ) {
    return this.capaService.createRootCause(actor, caseId, dto);
  }

  @Get('root-causes')
  listRootCauses(@CurrentUser() actor: AuthenticatedUser, @Param('caseId', ParseUUIDPipe) caseId: string) {
    return this.capaService.listRootCauses(actor, caseId);
  }

  @Get('root-causes/current')
  getCurrentRootCause(@CurrentUser() actor: AuthenticatedUser, @Param('caseId', ParseUUIDPipe) caseId: string) {
    return this.capaService.getCurrentRootCause(actor, caseId);
  }

  @Post('capa-actions')
  @UseGuards(RolesGuard)
  @Roles(...CASE_ROLES)
  createAction(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: CreateCapaActionDto,
  ) {
    return this.capaService.createAction(actor, caseId, dto);
  }

  @Get('capa-actions')
  listActions(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Query('status') status?: CapaActionStatus,
  ) {
    return this.capaService.listActions(actor, caseId, status);
  }

  @Post('capa-actions/:actionId/start')
  @UseGuards(RolesGuard)
  @Roles(...CASE_ROLES)
  start(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('actionId', ParseUUIDPipe) actionId: string,
  ) {
    return this.capaService.start(actor, caseId, actionId);
  }

  @Post('capa-actions/:actionId/complete')
  @UseGuards(RolesGuard)
  @Roles(...CASE_ROLES)
  complete(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('actionId', ParseUUIDPipe) actionId: string,
    @Body() dto: CompleteCapaActionDto,
  ) {
    return this.capaService.complete(actor, caseId, actionId, dto);
  }

  @Post('capa-actions/:actionId/cancel')
  @UseGuards(RolesGuard)
  @Roles(...CASE_ROLES)
  cancel(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('actionId', ParseUUIDPipe) actionId: string,
    @Body() dto: CancelCapaActionDto,
  ) {
    return this.capaService.cancel(actor, caseId, actionId, dto);
  }

  @Post('capa-actions/:actionId/validate')
  @UseGuards(RolesGuard)
  @Roles(...CAPA_VALIDATION_ROLES)
  validate(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('actionId', ParseUUIDPipe) actionId: string,
    @Body() dto: ValidateCapaActionDto,
  ) {
    return this.capaService.validate(actor, caseId, actionId, dto);
  }

  @Get('capa-actions/:actionId/validations')
  listValidations(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('actionId', ParseUUIDPipe) actionId: string,
  ) {
    return this.capaService.listValidations(actor, caseId, actionId);
  }
}

/** Separate, root-level controller for the two cross-case CAPA queues (added 2026-10-14) — same
 * reasoning as `EvidenceQueueController`/`RecoveryQueueController`. Two routes, not one, because
 * `CONTROL_OWNER`'s and `EFFECTIVENESS_REVIEWER`'s dashboards need genuinely different queries
 * (own-owned vs. pending-validation-excluding-own), not one list sliced two ways client-side. */
@Controller('capa')
@UseGuards(RolesGuard)
@Roles(...EXCEPT_REPORTER_ROLES)
export class CapaQueueController {
  constructor(private readonly capaService: CapaService) {}

  @Get('queue/owned')
  queueOwned(@CurrentUser() actor: AuthenticatedUser) {
    return this.capaService.queueOwned(actor);
  }

  @Get('queue/validation')
  queuePendingValidation(@CurrentUser() actor: AuthenticatedUser) {
    return this.capaService.queuePendingValidation(actor);
  }

  /** General register for the top-level Remediation nav page — every CAPA action across every
   * accessible case, not the owner/validator-personalized queues above. */
  @Get()
  listAll(@CurrentUser() actor: AuthenticatedUser) {
    return this.capaService.listAll(actor);
  }
}
