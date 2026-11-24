import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.interface';
import { CASE_ROLES, EXCEPT_REPORTER_ROLES, LEGAL_HOLD_ROLES } from '../../common/constants/roles';
import { IngestEvidenceDto } from './dto/ingest-evidence.dto';
import { RecordCustodyEventDto } from './dto/record-custody-event.dto';
import { SetLegalHoldDto } from './dto/set-legal-hold.dto';
import { VerifyEvidenceDto } from './dto/verify-evidence.dto';
import { EvidenceService } from './evidence.service';

/** `CASE_ROLES`/`LEGAL_HOLD_ROLES` now live in `common/constants/roles.ts`. Legal hold keeps a
 * narrower gate — setting/releasing one is more consequential than ordinary evidence handling,
 * matching how `cases`' flag endpoints and `workflow`'s SLA-pause both narrow their role gate
 * relative to their own module's routine actions. */

@Controller('cases/:caseId/evidence')
@UseGuards(RolesGuard)
@Roles(...EXCEPT_REPORTER_ROLES)
export class EvidenceController {
  constructor(private readonly evidenceService: EvidenceService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(...CASE_ROLES)
  ingest(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: IngestEvidenceDto,
  ) {
    return this.evidenceService.ingest(actor, caseId, dto);
  }

  @Get()
  listItems(@CurrentUser() actor: AuthenticatedUser, @Param('caseId', ParseUUIDPipe) caseId: string) {
    return this.evidenceService.listItems(actor, caseId);
  }

  @Get(':evidenceId')
  getById(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('evidenceId', ParseUUIDPipe) evidenceId: string,
  ) {
    return this.evidenceService.getById(actor, caseId, evidenceId);
  }

  @Post(':evidenceId/custody')
  @UseGuards(RolesGuard)
  @Roles(...CASE_ROLES)
  recordCustodyEvent(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('evidenceId', ParseUUIDPipe) evidenceId: string,
    @Body() dto: RecordCustodyEventDto,
  ) {
    return this.evidenceService.recordCustodyEvent(actor, caseId, evidenceId, dto);
  }

  @Post(':evidenceId/verify')
  @UseGuards(RolesGuard)
  @Roles(...CASE_ROLES)
  verify(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('evidenceId', ParseUUIDPipe) evidenceId: string,
    @Body() dto: VerifyEvidenceDto,
  ) {
    return this.evidenceService.verify(actor, caseId, evidenceId, dto);
  }

  @Post(':evidenceId/legal-hold')
  @UseGuards(RolesGuard)
  @Roles(...LEGAL_HOLD_ROLES)
  setLegalHold(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('evidenceId', ParseUUIDPipe) evidenceId: string,
    @Body() dto: SetLegalHoldDto,
  ) {
    return this.evidenceService.setLegalHold(actor, caseId, evidenceId, dto);
  }
}

/** Separate, root-level controller (not nested under `cases/:caseId`) for the one cross-case
 * route this module exposes — the Evidence Custodian dashboard's queue, added 2026-10-14. No
 * `@Roles()` gate: `EvidenceService.queue()` already filters to accessible cases via
 * `CasesService.getVisibleCaseIds`, same "the access check that matters isn't a role gate"
 * reasoning as every other read route in this module. */
@Controller('evidence')
@UseGuards(RolesGuard)
@Roles(...EXCEPT_REPORTER_ROLES)
export class EvidenceQueueController {
  constructor(private readonly evidenceService: EvidenceService) {}

  @Get('queue')
  queue(@CurrentUser() actor: AuthenticatedUser) {
    return this.evidenceService.queue(actor);
  }

  /** General register for the top-level Evidence nav page — every item across every accessible
   * case, not the curated `queue()` subset. `legalHold=true` backs the Retention & Legal Holds
   * settings page. */
  @Get()
  listAll(@CurrentUser() actor: AuthenticatedUser, @Query('legalHold') legalHold?: string) {
    return this.evidenceService.listAll(actor, legalHold === undefined ? undefined : legalHold === 'true');
  }
}
