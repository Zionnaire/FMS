import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { IncidentsModule } from '../incidents/incidents.module';
import { TriageModule } from '../triage/triage.module';
import { ApprovalService } from './approval.service';
import { SlaClockController } from './sla-clock.controller';
import { SlaClockService } from './sla-clock.service';

/**
 * Deliberately does NOT import `CasesModule` — see the doc comment on `ApprovalService` for why
 * that one-directional boundary (only `cases` depends on `workflow`, never the reverse) is what
 * lets `cases` enforce the Case-closure approval gate without a circular module dependency.
 * `ApprovalController` doesn't exist here for the same reason — approval routes live on
 * `CasesController`'s side, where the case-access check already happens. `IdentityModule` is
 * imported explicitly (not inherited via `IncidentsModule`, which doesn't re-export it) for
 * `ApprovalService` to resolve who's authorized to decide a request via
 * `UsersService.listActiveUserIdsByRole`.
 */
@Module({
  imports: [IdentityModule, IncidentsModule, TriageModule],
  controllers: [SlaClockController],
  providers: [SlaClockService, ApprovalService],
  exports: [SlaClockService, ApprovalService],
})
export class WorkflowModule {}
