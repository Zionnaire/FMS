import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ObligationStatus } from '@prisma/client';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.interface';
import { CASE_ROLES } from '../../common/constants/roles';
import { AcknowledgeObligationDto } from './dto/acknowledge-obligation.dto';
import { CreateObligationDto } from './dto/create-obligation.dto';
import { SubmitObligationDto } from './dto/submit-obligation.dto';
import { WaiveObligationDto } from './dto/waive-obligation.dto';
import { RegulatoryService } from './regulatory.service';

/** `CASE_ROLES` now lives in `common/constants/roles.ts`. No narrower gate on submit/acknowledge/
 * waive: the consequential gate is the CD-04 `REGULATORY_SUBMISSION` approval already required to
 * submit — same reasoning `ContainmentController`/`RecoveryController` already use for their own
 * CD-04-gated actions. */

@Controller('cases/:caseId/regulatory-obligations')
export class RegulatoryController {
  constructor(private readonly regulatoryService: RegulatoryService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(...CASE_ROLES)
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: CreateObligationDto,
  ) {
    return this.regulatoryService.createObligation(actor, caseId, dto);
  }

  @Get()
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Query('status') status?: ObligationStatus,
  ) {
    return this.regulatoryService.listObligations(actor, caseId, status);
  }

  @Get(':obligationId')
  getById(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('obligationId', ParseUUIDPipe) obligationId: string,
  ) {
    return this.regulatoryService.getById(actor, caseId, obligationId);
  }

  @Post(':obligationId/submit')
  @UseGuards(RolesGuard)
  @Roles(...CASE_ROLES)
  submit(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('obligationId', ParseUUIDPipe) obligationId: string,
    @Body() dto: SubmitObligationDto,
  ) {
    return this.regulatoryService.submit(actor, caseId, obligationId, dto);
  }

  @Post(':obligationId/acknowledge')
  @UseGuards(RolesGuard)
  @Roles(...CASE_ROLES)
  acknowledge(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('obligationId', ParseUUIDPipe) obligationId: string,
    @Body() dto: AcknowledgeObligationDto,
  ) {
    return this.regulatoryService.acknowledge(actor, caseId, obligationId, dto);
  }

  @Post(':obligationId/waive')
  @UseGuards(RolesGuard)
  @Roles(...CASE_ROLES)
  waive(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('obligationId', ParseUUIDPipe) obligationId: string,
    @Body() dto: WaiveObligationDto,
  ) {
    return this.regulatoryService.waive(actor, caseId, obligationId, dto);
  }
}

/** Separate, root-level controller for the top-level Regulatory reports nav page's cross-case
 * register (added for the register-pages pass) — same reasoning as `EvidenceQueueController`/
 * `ContainmentQueueController`: no `@Roles()` gate, access enforced purely via `getVisibleCaseIds`
 * filtering inside `listAll`. */
@Controller('regulatory-obligations')
export class RegulatoryQueueController {
  constructor(private readonly regulatoryService: RegulatoryService) {}

  @Get()
  listAll(@CurrentUser() actor: AuthenticatedUser) {
    return this.regulatoryService.listAll(actor);
  }
}
