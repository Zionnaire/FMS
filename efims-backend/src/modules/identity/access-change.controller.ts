import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.interface';
import { AccessChangeService } from './access-change.service';
import { DecideAccessChangeDto } from './dto/decide-access-change.dto';
import { RequestAccessChangeDto } from './dto/request-access-change.dto';

/** `ADMIN`-only on both ends — requesting and deciding a role/compartment change is exactly the
 * kind of "business-content access" the `Role` enum's own doc comment says `ADMIN` should keep
 * (provisioning), not something this pass widens to `CONFIG_ADMIN` or any business role. */
@Controller()
export class AccessChangeController {
  constructor(private readonly accessChangeService: AccessChangeService) {}

  @Post('users/:userId/access-changes')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  request(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: RequestAccessChangeDto,
  ) {
    return this.accessChangeService.request(actor, userId, dto);
  }

  @Get('users/:userId/access-changes')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  list(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.accessChangeService.list(userId);
  }

  @Get('access-change-requests')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  listAll() {
    return this.accessChangeService.list();
  }

  @Post('access-change-requests/:id/decide')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  decide(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DecideAccessChangeDto) {
    return this.accessChangeService.decide(actor, id, dto);
  }
}
