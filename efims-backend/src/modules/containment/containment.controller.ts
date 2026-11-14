import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.interface';
import { CASE_ROLES } from '../../common/constants/roles';
import { CancelContainmentDto } from './dto/cancel-containment.dto';
import { ConfirmContainmentDto } from './dto/confirm-containment.dto';
import { RejectContainmentDto } from './dto/reject-containment.dto';
import { RequestContainmentDto } from './dto/request-containment.dto';
import { ContainmentService } from './containment.service';

/** `CASE_ROLES` now lives in `common/constants/roles.ts`. No narrower gate on confirm/reject/
 * cancel: the consequential gate is the CD-04 `CONTAINMENT` approval already required to create
 * the request in the first place — see `ContainmentService.create`. */

@Controller('cases/:caseId/containment-requests')
export class ContainmentController {
  constructor(private readonly containmentService: ContainmentService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(...CASE_ROLES)
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: RequestContainmentDto,
  ) {
    return this.containmentService.create(actor, caseId, dto);
  }

  @Get()
  list(@CurrentUser() actor: AuthenticatedUser, @Param('caseId', ParseUUIDPipe) caseId: string) {
    return this.containmentService.list(actor, caseId);
  }

  @Get(':requestId')
  getById(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
  ) {
    return this.containmentService.getById(actor, caseId, requestId);
  }

  @Post(':requestId/confirm')
  @UseGuards(RolesGuard)
  @Roles(...CASE_ROLES)
  confirm(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() dto: ConfirmContainmentDto,
  ) {
    return this.containmentService.confirm(actor, caseId, requestId, dto);
  }

  @Post(':requestId/reject')
  @UseGuards(RolesGuard)
  @Roles(...CASE_ROLES)
  reject(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() dto: RejectContainmentDto,
  ) {
    return this.containmentService.reject(actor, caseId, requestId, dto);
  }

  @Post(':requestId/cancel')
  @UseGuards(RolesGuard)
  @Roles(...CASE_ROLES)
  cancel(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() dto: CancelContainmentDto,
  ) {
    return this.containmentService.cancel(actor, caseId, requestId, dto);
  }
}

/** Separate, root-level controller for the top-level Containment nav page's cross-case register
 * (added for the register-pages pass) — same reasoning as `EvidenceQueueController`/
 * `RecoveryQueueController`/`CapaQueueController`: no `@Roles()` gate, access enforced purely via
 * `getVisibleCaseIds` filtering inside `listAll`. */
@Controller('containment-requests')
export class ContainmentQueueController {
  constructor(private readonly containmentService: ContainmentService) {}

  @Get()
  listAll(@CurrentUser() actor: AuthenticatedUser) {
    return this.containmentService.listAll(actor);
  }
}
