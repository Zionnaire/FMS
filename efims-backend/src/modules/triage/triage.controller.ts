import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.interface';
import { EXCEPT_REPORTER_ROLES, TRIAGE_ROLES } from '../../common/constants/roles';
import { DecidePredictionDto } from '../ml-gateway/dto/decide-prediction.dto';
import { CreateTriageAssessmentDto } from './dto/create-triage-assessment.dto';
import { TriageService } from './triage.service';

/** Nested under the incident it belongs to (`/incidents/:incidentId/triage...`), same pattern as
 * the whistleblower-identity route on IncidentsController — a triage assessment only ever makes
 * sense in the context of one specific incident. `TRIAGE_ROLES` (shared constant) gates the write
 * routes; read routes carry no `@Roles()` gate of their own since TriageService.getCurrent/
 * getHistory already delegate to IncidentsService.getById for the compartment-visibility check
 * that actually matters. */

@Controller('incidents/:incidentId/triage')
export class TriageController {
  constructor(private readonly triageService: TriageService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(...TRIAGE_ROLES)
  assess(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @Body() dto: CreateTriageAssessmentDto,
  ) {
    return this.triageService.assess(actor, incidentId, dto);
  }

  @Post('escalate')
  @UseGuards(RolesGuard)
  @Roles(...TRIAGE_ROLES)
  escalate(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @Body() dto: CreateTriageAssessmentDto,
  ) {
    return this.triageService.escalate(actor, incidentId, dto);
  }

  @Get()
  getCurrent(@CurrentUser() actor: AuthenticatedUser, @Param('incidentId', ParseUUIDPipe) incidentId: string) {
    return this.triageService.getCurrent(actor, incidentId);
  }

  @Get('history')
  getHistory(@CurrentUser() actor: AuthenticatedUser, @Param('incidentId', ParseUUIDPipe) incidentId: string) {
    return this.triageService.getHistory(actor, incidentId);
  }

  /** CD-08 Phase 2 advisory severity suggestion — read-only, same `TRIAGE_ROLES` gate as
   * `assess`/`escalate` (whoever can triage should see the suggestion), never writes anything. */
  @Get('suggestion')
  @UseGuards(RolesGuard)
  @Roles(...TRIAGE_ROLES)
  suggestSeverity(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @Query('allowLlmFallback') allowLlmFallback?: string,
  ) {
    return this.triageService.suggestSeverity(actor, incidentId, allowLlmFallback === 'true');
  }

  /** The EFIMS AI Service's v1.0 integration spec, rule #3 — "record whether the analyst
   * accepted or overrode it." Entity-scoped (nested under this incident) specifically so the
   * incident's own compartment/clearance access check runs before anyone can decide a prediction
   * about it — see `TriageService.decideSeveritySuggestion`'s own doc comment. Gated
   * `EXCEPT_REPORTER_ROLES`, same breadth as `MlGatewayController`'s anomaly-only decide route,
   * rather than `TRIAGE_ROLES` — deciding is a lighter action than triaging itself. */
  @Patch('suggestion/:predictionId/decision')
  @UseGuards(RolesGuard)
  @Roles(...EXCEPT_REPORTER_ROLES)
  async decideSeveritySuggestion(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @Param('predictionId') predictionId: string,
    @Body() dto: DecidePredictionDto,
  ) {
    await this.triageService.decideSeveritySuggestion(actor, incidentId, predictionId, dto.decision);
    return { predictionId, decision: dto.decision };
  }
}

/** Separate, non-nested controller for the tenant-wide severity trend — not scoped to one
 * incident, so it doesn't belong under `/incidents/:incidentId/triage`. Same "a small dedicated
 * controller for a cross-case/tenant-wide concern" pattern as `EvidenceQueueController`/
 * `RecoveryQueueController`. */
@Controller('triage')
export class TriageTrendController {
  constructor(private readonly triageService: TriageService) {}

  @Get('severity-trend')
  severityTrend(@CurrentUser() actor: AuthenticatedUser, @Query('days') days?: string) {
    const parsed = days ? Number(days) : 30;
    return this.triageService.severityTrend(actor, Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 90) : 30);
  }
}
