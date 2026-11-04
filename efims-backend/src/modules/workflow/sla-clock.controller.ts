import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.interface';
import { CLOCK_ROLES, PAUSE_ROLES } from '../../common/constants/roles';
import { PauseSlaClockDto } from './dto/pause-sla-clock.dto';
import { StartSlaClockDto } from './dto/start-sla-clock.dto';
import { SlaClockService } from './sla-clock.service';

/** Nested under the incident, same convention as `/incidents/:incidentId/triage`.
 * `CLOCK_ROLES`/`PAUSE_ROLES` now live in `common/constants/roles.ts` — pause/resume are gated to
 * a narrower, more senior set than start/stop — CD-03's "any SLA pause requires ... approval"
 * reads as more consequential than starting or stopping the clock outright. */

@Controller('incidents/:incidentId/sla-clock')
export class SlaClockController {
  constructor(private readonly slaClockService: SlaClockService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(...CLOCK_ROLES)
  start(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @Body() dto: StartSlaClockDto,
  ) {
    return this.slaClockService.start(actor, incidentId, dto);
  }

  @Get()
  getCurrent(@CurrentUser() actor: AuthenticatedUser, @Param('incidentId', ParseUUIDPipe) incidentId: string) {
    return this.slaClockService.getCurrent(actor, incidentId);
  }

  @Post(':clockId/pause')
  @UseGuards(RolesGuard)
  @Roles(...PAUSE_ROLES)
  pause(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('clockId', ParseUUIDPipe) clockId: string,
    @Body() dto: PauseSlaClockDto,
  ) {
    return this.slaClockService.pause(actor, clockId, dto);
  }

  @Post(':clockId/resume')
  @UseGuards(RolesGuard)
  @Roles(...PAUSE_ROLES)
  resume(@CurrentUser() actor: AuthenticatedUser, @Param('clockId', ParseUUIDPipe) clockId: string) {
    return this.slaClockService.resume(actor, clockId);
  }

  @Post(':clockId/stop')
  @UseGuards(RolesGuard)
  @Roles(...CLOCK_ROLES)
  stop(@CurrentUser() actor: AuthenticatedUser, @Param('clockId', ParseUUIDPipe) clockId: string) {
    return this.slaClockService.stop(actor, clockId);
  }
}
