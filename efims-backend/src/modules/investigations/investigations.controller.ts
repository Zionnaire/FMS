import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { IssueStatus } from '@prisma/client';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.interface';
import { CASE_ROLES } from '../../common/constants/roles';
import { CreateFindingDto } from './dto/create-finding.dto';
import { CreateInterviewDto } from './dto/create-interview.dto';
import { CreateInvestigationPlanDto } from './dto/create-investigation-plan.dto';
import { CreateIssueDto } from './dto/create-issue.dto';
import { ResolveIssueDto } from './dto/resolve-issue.dto';
import { InvestigationsService } from './investigations.service';

/** `CASE_ROLES` now lives in `common/constants/roles.ts`. Read routes carry no `@Roles()` gate of
 * their own: `InvestigationsService` delegates to `CasesService.getById` for the check that
 * actually matters (the full 7-condition rule), same pattern as every other case-scoped
 * controller. */

@Controller('cases/:caseId')
export class InvestigationsController {
  constructor(private readonly investigationsService: InvestigationsService) {}

  @Post('investigation-plans')
  @UseGuards(RolesGuard)
  @Roles(...CASE_ROLES)
  createPlan(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: CreateInvestigationPlanDto,
  ) {
    return this.investigationsService.createPlan(actor, caseId, dto);
  }

  @Get('investigation-plans')
  listPlans(@CurrentUser() actor: AuthenticatedUser, @Param('caseId', ParseUUIDPipe) caseId: string) {
    return this.investigationsService.listPlans(actor, caseId);
  }

  @Get('investigation-plans/current')
  getCurrentPlan(@CurrentUser() actor: AuthenticatedUser, @Param('caseId', ParseUUIDPipe) caseId: string) {
    return this.investigationsService.getCurrentPlan(actor, caseId);
  }

  @Post('issues')
  @UseGuards(RolesGuard)
  @Roles(...CASE_ROLES)
  raiseIssue(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: CreateIssueDto,
  ) {
    return this.investigationsService.raiseIssue(actor, caseId, dto);
  }

  @Get('issues')
  listIssues(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Query('status') status?: IssueStatus,
  ) {
    return this.investigationsService.listIssues(actor, caseId, status);
  }

  @Post('issues/:issueId/resolve')
  @UseGuards(RolesGuard)
  @Roles(...CASE_ROLES)
  resolveIssue(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('issueId', ParseUUIDPipe) issueId: string,
    @Body() dto: ResolveIssueDto,
  ) {
    return this.investigationsService.resolveIssue(actor, caseId, issueId, dto);
  }

  @Post('interviews')
  @UseGuards(RolesGuard)
  @Roles(...CASE_ROLES)
  recordInterview(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: CreateInterviewDto,
  ) {
    return this.investigationsService.recordInterview(actor, caseId, dto);
  }

  @Get('interviews')
  listInterviews(@CurrentUser() actor: AuthenticatedUser, @Param('caseId', ParseUUIDPipe) caseId: string) {
    return this.investigationsService.listInterviews(actor, caseId);
  }

  @Post('findings')
  @UseGuards(RolesGuard)
  @Roles(...CASE_ROLES)
  recordFinding(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: CreateFindingDto,
  ) {
    return this.investigationsService.recordFinding(actor, caseId, dto);
  }

  @Get('findings')
  listFindings(@CurrentUser() actor: AuthenticatedUser, @Param('caseId', ParseUUIDPipe) caseId: string) {
    return this.investigationsService.listFindings(actor, caseId);
  }
}

/** Separate, root-level controller for the top-level Investigations nav page's cross-case
 * register (added for the register-pages pass) — same reasoning as `EvidenceQueueController`/
 * `ContainmentQueueController`: no `@Roles()` gate, access enforced purely via `getVisibleCaseIds`
 * filtering inside `listAll`. */
@Controller('investigations')
export class InvestigationsQueueController {
  constructor(private readonly investigationsService: InvestigationsService) {}

  @Get()
  listAll(@CurrentUser() actor: AuthenticatedUser) {
    return this.investigationsService.listAll(actor);
  }
}
