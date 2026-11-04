import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
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
}
