import { Controller, Get, Param, ParseUUIDPipe, Post, Body, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.interface';
import { DEFAULT_PAGE_SIZE } from '../../common/dto/pagination-query.dto';
import { IncidentsService } from './incidents.service';
import { ListIncidentsDto } from './dto/list-incidents.dto';
import { MergeIncidentDto } from './dto/merge-incident.dto';
import { RelateIncidentsDto } from './dto/relate-incidents.dto';
import { WhistleblowerVaultService } from './whistleblower-vault.service';

/**
 * No `POST /incidents` here — see the doc comment on IncidentsService.createFromSignal for why
 * incident creation only happens through `POST /signals/:id/validate`. Read/relate/merge routes
 * carry no `@Roles()` gate of their own: IncidentsService.getById already enforces compartment
 * visibility (and audits denials) for every actor, which is the check that actually matters here.
 */
@Controller('incidents')
export class IncidentsController {
  constructor(
    private readonly incidentsService: IncidentsService,
    private readonly whistleblowerVault: WhistleblowerVaultService,
  ) {}

  @Get()
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
  findSimilar(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.incidentsService.findSimilarIncidents(actor, id);
  }

  @Post(':id/relate')
  relate(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RelateIncidentsDto,
  ) {
    return this.incidentsService.relate(actor, id, dto);
  }

  @Post(':id/merge')
  merge(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MergeIncidentDto,
  ) {
    return this.incidentsService.merge(actor, id, dto);
  }

  /** Reads the reporter identity for the whistleblower Signal that raised this incident, not
   * anything on Incident itself — routed here rather than under /signals purely for URL
   * ergonomics (an investigator looking at an incident is the realistic entry point). Role
   * gating lives entirely in WhistleblowerVaultService.getIdentity, not here — see its doc
   * comment for why every access, not just denials, is audited. */
  @Get(':signalId/whistleblower-identity')
  getWhistleblowerIdentity(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('signalId', ParseUUIDPipe) signalId: string,
  ) {
    return this.whistleblowerVault.getIdentity(actor, signalId);
  }
}
