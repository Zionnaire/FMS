import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.interface';
import { AUDIT_READ_ROLES } from '../../common/constants/roles';
import { AuditService } from './audit.service';
import { QueryAuditEventsDto } from './dto/query-audit-events.dto';

/** `AUDIT_READ_ROLES` now lives in `common/constants/roles.ts` — oversight-only. Reading the
 * audit log is itself audited by `AuditService.query`/`verifyChain`, not here — this controller
 * only gates who can reach them. */

@Controller('audit-events')
@UseGuards(RolesGuard)
@Roles(...AUDIT_READ_ROLES)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  query(@CurrentUser() actor: AuthenticatedUser, @Query() dto: QueryAuditEventsDto) {
    return this.auditService.query(actor, {
      entityType: dto.entityType,
      entityId: dto.entityId,
      actorUserId: dto.actorUserId,
      action: dto.action,
      outcome: dto.outcome,
      from: dto.from ? new Date(dto.from) : undefined,
      to: dto.to ? new Date(dto.to) : undefined,
      limit: dto.limit,
      offset: dto.offset,
    });
  }

  @Get('verify')
  verifyChain(@CurrentUser() actor: AuthenticatedUser) {
    return this.auditService.verifyChain(actor);
  }

  @Get('stats')
  stats(@CurrentUser() actor: AuthenticatedUser) {
    return this.auditService.stats(actor);
  }
}
