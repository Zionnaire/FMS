import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { CdKey } from '@prisma/client';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.interface';
import { CONFIG_ROLES } from '../../common/constants/roles';
import { ConfigurationService } from './configuration.service';
import { CreateConfigurationVersionDto } from './dto/create-configuration-version.dto';
import { RatifyConfigurationVersionDto } from './dto/ratify-configuration-version.dto';
import { ParseCdKeyPipe } from './pipes/parse-cd-key.pipe';

/**
 * Mutation routes are gated to `CONFIG_ROLES` (`common/constants/roles.ts`:
 * ADMIN/EXECUTIVE/CONFIG_ADMIN) as a stand-in for "the owning function named in
 * configuration-decisions.md" (Fraud Risk, Risk/Executive, Operations, Governance, Legal/Records,
 * Sponsor, Technology, Model Governance — none of which map 1:1 onto the `Role` enum identity
 * owns). `CONFIG_ADMIN` (added 2026-10-14) is this module's own properly-scoped governance owner,
 * rather than configuration ratification being just another thing `ADMIN` happens to be allowed
 * to do. A real per-CD-owner approval mapping is future work, not something to invent here ahead
 * of need.
 */
@Controller('configuration')
export class ConfigurationController {
  constructor(private readonly configurationService: ConfigurationService) {}

  @Get()
  getAllCurrent() {
    return this.configurationService.getAllCurrent();
  }

  @Get(':key')
  async getOne(@Param('key', ParseCdKeyPipe) key: CdKey) {
    // Sequential, not Promise.all — each call opens its own transaction (see
    // ConfigurationService.getCurrent/getHistory), and firing transactions concurrently is
    // exactly what caused a live, connection-pool-contention failure in getAllCurrent() (see
    // that method's doc comment). Two sequential round trips is cheap enough here not to be
    // worth the same single-transaction consolidation.
    const current = await this.configurationService.getCurrent(key);
    const history = await this.configurationService.getHistory(key);
    return { key, current, history };
  }

  @Post(':key')
  @UseGuards(RolesGuard)
  @Roles(...CONFIG_ROLES)
  createDraft(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('key', ParseCdKeyPipe) key: CdKey,
    @Body() dto: CreateConfigurationVersionDto,
  ) {
    return this.configurationService.createDraft(actor, key, dto);
  }

  @Post(':key/:version/ratify')
  @UseGuards(RolesGuard)
  @Roles(...CONFIG_ROLES)
  ratify(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('key', ParseCdKeyPipe) key: CdKey,
    @Param('version', ParseIntPipe) version: number,
    @Body() dto: RatifyConfigurationVersionDto,
  ) {
    return this.configurationService.ratify(actor, key, version, dto);
  }
}
