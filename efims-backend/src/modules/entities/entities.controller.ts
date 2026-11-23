import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.interface';
import { EXCEPT_REPORTER_ROLES } from '../../common/constants/roles';
import { AddIdentifierDto } from './dto/add-identifier.dto';
import { AddRelationshipDto } from './dto/add-relationship.dto';
import { CreateEntityDto, UpdateEntityDto } from './dto/create-entity.dto';
import { LinkCaseDto } from './dto/link-case.dto';
import { RecordRiskAssessmentDto } from './dto/record-risk-assessment.dto';
import { SetWatchlistDto } from './dto/set-watchlist.dto';
import { EntitiesService } from './entities.service';

/** `Entity` is tenant-wide, not case-scoped (unlike every other module in this codebase), so
 * there's no per-record `CasesService.getById` call to lean on as the fine-grained gate — every
 * route here is gated `EXCEPT_REPORTER_ROLES` instead, the same "non-case-scoped investigative
 * tool" precedent `MlGatewayController`'s standalone transaction-risk-scoring route already set
 * (see `common/constants/roles.ts`'s own doc comment on that constant). The one place this module
 * DOES call into `cases` — `linkCase`/`unlinkCase` — is gated additionally by that specific case's
 * own access check inside `EntitiesService`, not just the role here. */
@Controller('entities')
@UseGuards(RolesGuard)
@Roles(...EXCEPT_REPORTER_ROLES)
export class EntitiesController {
  constructor(private readonly entitiesService: EntitiesService) {}

  @Post()
  create(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateEntityDto) {
    return this.entitiesService.create(actor, dto);
  }

  @Get()
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('type') type?: string,
    @Query('watchlisted') watchlisted?: string,
    @Query('search') search?: string,
  ) {
    return this.entitiesService.list(actor, {
      type,
      watchlisted: watchlisted === undefined ? undefined : watchlisted === 'true',
      search,
    });
  }

  @Get(':id')
  getById(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.entitiesService.getById(actor, id);
  }

  @Patch(':id')
  update(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateEntityDto) {
    return this.entitiesService.update(actor, id, dto);
  }

  @Delete(':id')
  delete(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.entitiesService.delete(actor, id);
  }

  @Post(':id/identifiers')
  addIdentifier(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AddIdentifierDto) {
    return this.entitiesService.addIdentifier(actor, id, dto);
  }

  @Post(':id/relationships')
  addRelationship(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AddRelationshipDto) {
    return this.entitiesService.addRelationship(actor, id, dto);
  }

  @Delete(':id/relationships/:relationshipId')
  removeRelationship(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('relationshipId', ParseUUIDPipe) relationshipId: string,
  ) {
    return this.entitiesService.removeRelationship(actor, id, relationshipId);
  }

  @Get(':id/graph')
  getGraph(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Query('depth') depth?: string) {
    return this.entitiesService.getGraph(actor, id, depth ? Number(depth) : 2);
  }

  @Post(':id/case-links')
  linkCase(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LinkCaseDto) {
    return this.entitiesService.linkCase(actor, id, dto);
  }

  @Delete(':id/case-links/:caseId')
  unlinkCase(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('caseId', ParseUUIDPipe) caseId: string,
  ) {
    return this.entitiesService.unlinkCase(actor, id, caseId);
  }

  @Post(':id/risk-assessments')
  recordRiskAssessment(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordRiskAssessmentDto,
  ) {
    return this.entitiesService.recordRiskAssessment(actor, id, dto);
  }

  @Get(':id/risk-assessments')
  listRiskAssessments(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.entitiesService.listRiskAssessments(actor, id);
  }

  @Post(':id/watchlist')
  setWatchlist(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SetWatchlistDto) {
    return this.entitiesService.setWatchlist(actor, id, dto);
  }
}
