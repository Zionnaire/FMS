import { Controller, Get, Param, ParseUUIDPipe, Patch, Post, Body, Query, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.interface';
import { DEFAULT_PAGE_SIZE } from '../../common/dto/pagination-query.dto';
import { EXCEPT_REPORTER_ROLES } from '../../common/constants/roles';
import { IncidentsService } from './incidents.service';
import { ListIncidentsDto } from './dto/list-incidents.dto';
import { MergeIncidentDto } from './dto/merge-incident.dto';
import { RelateIncidentsDto } from './dto/relate-incidents.dto';
import { UpdateRiskFactorsDto } from './dto/update-risk-factors.dto';
import { WhistleblowerVaultService } from './whistleblower-vault.service';

/**
 * No `POST /incidents` here — see the doc comment on IncidentsService.createFromSignal for why
 * incident creation only happens through `POST /signals/:id/validate`.
 *
 * Per-route (not class-level) `@Roles(...EXCEPT_REPORTER_ROLES)` added 2026-11-24 — see
 * `CasesController`'s own doc comment for the full story on why this controller had no role gate
 * at all, found live via an RBAC audit. `getOne` is deliberately the ONE route left open to
 * `INCIDENT_REPORTER` too (every other route here excludes it) — `ReporterDashboard`'s "View
 * incident" link depends on a reporter being able to open the one incident their own validated
 * report became; `IncidentsService.getById` now enforces that specific relationship itself (see
 * its own doc comment) rather than leaving it to a controller-level role gate that can't express
 * "only your own."
 */
@Controller('incidents')
export class IncidentsController {
  constructor(
    private readonly incidentsService: IncidentsService,
    private readonly whistleblowerVault: WhistleblowerVaultService,
  ) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles(...EXCEPT_REPORTER_ROLES)
  list(@CurrentUser() actor: AuthenticatedUser, @Query() dto: ListIncidentsDto) {
    return this.incidentsService.list(
      actor,
      dto.status,
      dto.limit ?? DEFAULT_PAGE_SIZE,
      dto.offset ?? 0,
      dto.compartment,
      dto.q,
      dto.mine === 'true',
    );
  }

  /** Registered ahead of `:id` on purpose — same Nest/Express route-order reasoning as
   * CasesController's `stats` route. Deliberately no severity/SLA breakdown here: those live in
   * `triage`/`workflow`, and both of those modules already depend on IncidentsService (see
   * TriageService's and SlaClockService's own doc comments) — IncidentsService depending back on
   * either to enrich this summary would be a circular module dependency, not just an
   * inconvenience. A richer cross-module incidents dashboard is a real follow-up, not solved by
   * forcing that cycle here. */
  @Get('stats')
  @UseGuards(RolesGuard)
  @Roles(...EXCEPT_REPORTER_ROLES)
  stats(@CurrentUser() actor: AuthenticatedUser) {
    return this.incidentsService.stats(actor);
  }

  @Get(':id')
  getOne(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.incidentsService.getById(actor, id);
  }

  /** CD-08 Phase 2 advisory duplicate/correlation detection — read-only, no `@Roles()` gate of
   * its own since `getById` inside it already enforces the compartment-visibility check that
   * matters, same reasoning as every other read route in this controller. */
  @Get(':id/similar')
  @UseGuards(RolesGuard)
  @Roles(...EXCEPT_REPORTER_ROLES)
  findSimilar(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.incidentsService.findSimilarIncidents(actor, id);
  }

  @Post(':id/relate')
  @UseGuards(RolesGuard)
  @Roles(...EXCEPT_REPORTER_ROLES)
  relate(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RelateIncidentsDto,
  ) {
    return this.incidentsService.relate(actor, id, dto);
  }

  @Post(':id/merge')
  @UseGuards(RolesGuard)
  @Roles(...EXCEPT_REPORTER_ROLES)
  merge(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MergeIncidentDto,
  ) {
    return this.incidentsService.merge(actor, id, dto);
  }

  /** Structured facts the EFIMS AI Service's severity model needs — see
   * `IncidentsService.updateRiskFactors`'s own doc comment. */
  @Patch(':id/risk-factors')
  @UseGuards(RolesGuard)
  @Roles(...EXCEPT_REPORTER_ROLES)
  updateRiskFactors(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRiskFactorsDto,
  ) {
    return this.incidentsService.updateRiskFactors(actor, id, dto);
  }

  /** Reads the reporter identity for the whistleblower Signal that raised this incident, not
   * anything on Incident itself — routed here rather than under /signals purely for URL
   * ergonomics (an investigator looking at an incident is the realistic entry point). Role
   * gating lives entirely in WhistleblowerVaultService.getIdentity, not here — see its doc
   * comment for why every access, not just denials, is audited. */
  @Get(':signalId/whistleblower-identity')
  @UseGuards(RolesGuard)
  @Roles(...EXCEPT_REPORTER_ROLES)
  getWhistleblowerIdentity(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('signalId', ParseUUIDPipe) signalId: string,
  ) {
    return this.whistleblowerVault.getIdentity(actor, signalId);
  }
}
