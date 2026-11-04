import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.interface';
import { AddTeamMemberDto } from './dto/add-team-member.dto';
import { TeamsService } from './teams.service';

/** Any authenticated user can list teams — needed so a triage or case caller can discover a
 * valid `assignedTeamId` at all; there's no sensitive information on a Team row itself (just a
 * name), unlike `WhistleblowerVaultService`. Membership management is admin-only, matching
 * `UsersController.createUser`'s own reasoning. */
@Controller('teams')
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Get()
  list() {
    return this.teamsService.list();
  }

  @Post(':id/members')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  addMember(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) teamId: string,
    @Body() dto: AddTeamMemberDto,
  ) {
    return this.teamsService.addMember(actor, teamId, dto.userId);
  }
}
