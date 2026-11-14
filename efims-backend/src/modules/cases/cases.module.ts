import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { IncidentsModule } from '../incidents/incidents.module';
import { TriageModule } from '../triage/triage.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { CasesController, ApprovalsQueueController } from './cases.controller';
import { CasesService } from './cases.service';

@Module({
  // AuditModule is @Global(), not listed here — same as every other module in this tree.
  // WorkflowModule: one-directional (cases -> workflow, never the reverse) — see
  // WorkflowModule's own doc comment for why that avoids a circular module dependency.
  // TriageModule: added for the per-case effective-severity rollup (`TriageService.
  // getLatestSeverityByIncidentIds`) — also one-directional, confirmed no cycle (neither
  // TriageModule nor anything it imports pulls in CasesModule).
  imports: [IdentityModule, IncidentsModule, WorkflowModule, TriageModule],
  controllers: [CasesController, ApprovalsQueueController],
  providers: [CasesService],
  exports: [CasesService],
})
export class CasesModule {}
