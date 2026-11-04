import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.interface';
import { DEFAULT_PAGE_SIZE } from '../../common/dto/pagination-query.dto';
import { TRIAGE_ROLES } from '../../common/constants/roles';
import { CreateSignalDto } from './dto/create-signal.dto';
import { ListSignalsDto } from './dto/list-signals.dto';
import { RejectSignalDto } from './dto/reject-signal.dto';
import { ValidateSignalDto } from './dto/validate-signal.dto';
import { SignalsService } from './signals.service';

/**
 * `TRIAGE_ROLES` now lives in `common/constants/roles.ts` — gates validate/reject. Everyone
 * authenticated can submit a signal (a signal is how a fraud alert, complaint, staff report, or
 * whistleblower tip ENTERS the system at all), but only operational staff decide whether it
 * becomes an Incident. That split is the whole point of Signal as its own entity.
 */

@Controller('signals')
export class SignalsController {
  constructor(private readonly signalsService: SignalsService) {}

  @Post()
  create(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateSignalDto) {
    return this.signalsService.create(actor, dto);
  }

  @Get()
  list(@CurrentUser() actor: AuthenticatedUser, @Query() dto: ListSignalsDto) {
    return this.signalsService.list(
      dto.status,
      dto.limit ?? DEFAULT_PAGE_SIZE,
      dto.offset ?? 0,
      dto.source,
      dto.q,
      dto.mine === 'true' ? actor.sub : undefined,
    );
  }

  /** Registered ahead of `:id` on purpose — same Nest/Express route-order reasoning as
   * CasesController's `stats` route. */
  @Get('stats')
  stats() {
    return this.signalsService.stats();
  }

  @Get(':id')
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.signalsService.getById(id);
  }

  @Post(':id/validate')
  @UseGuards(RolesGuard)
  @Roles(...TRIAGE_ROLES)
  validate(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ValidateSignalDto,
  ) {
    return this.signalsService.validate(actor, id, dto);
  }

  @Post(':id/reject')
  @UseGuards(RolesGuard)
  @Roles(...TRIAGE_ROLES)
  reject(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectSignalDto,
  ) {
    return this.signalsService.reject(actor, id, dto);
  }
}
