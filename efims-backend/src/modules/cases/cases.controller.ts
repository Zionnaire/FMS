import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.interface';
import { DEFAULT_PAGE_SIZE } from '../../common/dto/pagination-query.dto';
import { CASE_ROLES, FLAG_ROLES } from '../../common/constants/roles';
import { ApprovalService } from '../workflow/approval.service';
import { AddCaseUserFlagDto } from './dto/add-case-user-flag.dto';
import { AssignCaseTeamDto } from './dto/assign-case-team.dto';
import { BulkAssignCasesDto } from './dto/bulk-assign-cases.dto';
import { BulkEscalateCasesDto } from './dto/bulk-escalate-cases.dto';
import { CreateCaseDto } from './dto/create-case.dto';
import { LinkIncidentDto } from './dto/link-incident.dto';
import { ListCasesDto } from './dto/list-cases.dto';
import { UpdateCaseStatusDto } from './dto/update-case-status.dto';
import { CasesService } from './cases.service';
import { DecideApprovalDto } from '../workflow/dto/decide-approval.dto';
import { RequestApprovalDto } from '../workflow/dto/request-approval.dto';

/** `CASE_ROLES`/`FLAG_ROLES` now live in `common/constants/roles.ts` — single source of truth
 * shared across every case-scoped controller, see that file's own doc comment for why. Read
 * routes carry no `@Roles()` gate of their own: `CasesService` enforces the full 7-condition
 * access check (the actual point of non-negotiable #6) on every read, which is the check that
 * matters, not a coarse role gate. */

@Controller('cases')
export class CasesController {
  constructor(
    private readonly casesService: CasesService,
    private readonly approvalService: ApprovalService,
  ) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(...CASE_ROLES)
  create(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateCaseDto) {
    return this.casesService.create(actor, dto);
  }

  @Get()
  list(@CurrentUser() actor: AuthenticatedUser, @Query() dto: ListCasesDto) {
    return this.casesService.list(
      actor,
      dto.status,
      dto.limit ?? DEFAULT_PAGE_SIZE,
      dto.offset ?? 0,
      dto.compartment,
      dto.sensitivityLevel,
      dto.q,
      dto.sevFilter,
    );
  }

  /** Registered ahead of `:id` on purpose — Nest/Express matches routes in registration order,
   * so "GET /cases/stats" would otherwise be parsed as `:id = "stats"` and fail ParseUUIDPipe.
   * Same reasoning for `bulk-assign`/`bulk-escalate` below. */
  @Get('stats')
  stats(@CurrentUser() actor: AuthenticatedUser) {
    return this.casesService.stats(actor);
  }

  @Post('bulk-assign')
  @UseGuards(RolesGuard)
  @Roles(...CASE_ROLES)
  bulkAssignTeam(@CurrentUser() actor: AuthenticatedUser, @Body() dto: BulkAssignCasesDto) {
    return this.casesService.bulkAssignTeam(actor, dto);
  }

  @Post('bulk-escalate')
  @UseGuards(RolesGuard)
  @Roles(...CASE_ROLES)
  bulkEscalate(@CurrentUser() actor: AuthenticatedUser, @Body() dto: BulkEscalateCasesDto) {
    return this.casesService.bulkEscalate(actor, dto);
  }

  @Get(':id')
  getOne(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.casesService.getById(actor, id);
  }

  @Post(':id/status')
  @UseGuards(RolesGuard)
  @Roles(...CASE_ROLES)
  updateStatus(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCaseStatusDto,
  ) {
    return this.casesService.updateStatus(actor, id, dto);
  }

  @Post(':id/team')
  @UseGuards(RolesGuard)
  @Roles(...CASE_ROLES)
  assignTeam(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignCaseTeamDto,
  ) {
    return this.casesService.assignTeam(actor, id, dto);
  }

  /** Read-only, advisory — see `CasesService.checkTeamConflicts`'s own doc comment. No
   * `@Roles()` gate: anyone who can already see this case (enforced inside the service, same as
   * every other read route in this controller) can check a candidate team before proposing it,
   * not just whoever has `CASE_ROLES`' write access to actually assign it. */
  @Get(':id/team-conflict-check')
  checkTeamConflicts(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('teamId', ParseUUIDPipe) teamId: string,
  ) {
    return this.casesService.checkTeamConflicts(actor, id, teamId);
  }

  @Post(':id/incidents')
  @UseGuards(RolesGuard)
  @Roles(...CASE_ROLES)
  linkIncident(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LinkIncidentDto,
  ) {
    return this.casesService.linkIncident(actor, id, dto);
  }

  @Post(':id/flags')
  @UseGuards(RolesGuard)
  @Roles(...FLAG_ROLES)
  addFlag(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddCaseUserFlagDto,
  ) {
    return this.casesService.addFlag(actor, id, dto);
  }

  @Delete(':id/flags/:flagId')
  @UseGuards(RolesGuard)
  @Roles(...FLAG_ROLES)
  removeFlag(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('flagId', ParseUUIDPipe) flagId: string,
  ) {
    return this.casesService.removeFlag(actor, id, flagId);
  }

  /** Read routes carry no `@Roles()` gate of their own, same reasoning as every other read in
   * this controller — `CasesService.getById`'s 7-condition check is what actually matters. */
  @Get(':id/flags')
  listFlags(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.casesService.listFlags(actor, id);
  }

  @Get(':id/status-history')
  listStatusHistory(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.casesService.listStatusHistory(actor, id);
  }

  @Get(':id/summary')
  getSummary(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.casesService.getSummary(actor, id);
  }

  /**
   * Approval routes live here, on `CasesController`, not on a controller inside `workflow`
   * itself — `ApprovalService` deliberately has no case-access check of its own (see its doc
   * comment), so every route below calls `casesService.getById` first, exactly as every other
   * case-scoped route in this controller relies on that same check. No `@Roles()` gate on
   * `decide`: who's authorized varies per (action, severityBand) per CD-04's matrix, which is
   * inherently dynamic — enforced inside `ApprovalService.decide`, not expressible as a single
   * static role list here.
   */
  @Post(':id/approvals')
  @UseGuards(RolesGuard)
  @Roles(...CASE_ROLES)
  async requestApproval(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RequestApprovalDto,
  ) {
    await this.casesService.getById(actor, id);
    return this.approvalService.request(actor, id, dto);
  }

  @Get(':id/approvals')
  async listApprovals(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.casesService.getById(actor, id);
    return this.approvalService.list(id);
  }

  @Post(':id/approvals/:approvalId/decide')
  async decideApproval(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('approvalId', ParseUUIDPipe) approvalId: string,
    @Body() dto: DecideApprovalDto,
  ) {
    await this.casesService.getById(actor, id);
    return this.approvalService.decide(actor, id, approvalId, dto);
  }
}

/** Separate, root-level controller for the top-level Approvals nav page's cross-case register
 * (added for the register-pages pass). Lives here, not in `workflow`, because `ApprovalService`
 * deliberately has no `CasesService` dependency (see its own doc comment) — this is the one place
 * that legitimately has both services available to compute `getVisibleCaseIds` and hand it to
 * `ApprovalService.listAll`. No `@Roles()` gate, same reasoning as `EvidenceQueueController`/
 * `ContainmentQueueController`: access is enforced purely via that visible-case-ID filtering. */
@Controller('approvals')
export class ApprovalsQueueController {
  constructor(
    private readonly casesService: CasesService,
    private readonly approvalService: ApprovalService,
  ) {}

  @Get()
  async listAll(@CurrentUser() actor: AuthenticatedUser) {
    const visibleCaseIds = await this.casesService.getVisibleCaseIds(actor);
    return this.approvalService.listAll(visibleCaseIds);
  }
}
