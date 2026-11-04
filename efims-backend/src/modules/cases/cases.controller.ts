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
    );
  }

  /** Registered ahead of `:id` on purpose — Nest/Express matches routes in registration order,
   * so "GET /cases/stats" would otherwise be parsed as `:id = "stats"` and fail ParseUUIDPipe. */
  @Get('stats')
  stats(@CurrentUser() actor: AuthenticatedUser) {
    return this.casesService.stats(actor);
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
