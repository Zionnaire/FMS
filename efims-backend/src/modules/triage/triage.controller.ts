import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.interface';
import { TRIAGE_ROLES } from '../../common/constants/roles';
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
