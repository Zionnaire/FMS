import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { IncidentsModule } from '../incidents/incidents.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { CasesController } from './cases.controller';
import { CasesService } from './cases.service';

@Module({
  // AuditModule is @Global(), not listed here — same as every other module in this tree.
  // WorkflowModule: one-directional (cases -> workflow, never the reverse) — see
  // WorkflowModule's own doc comment for why that avoids a circular module dependency.
  imports: [IdentityModule, IncidentsModule, WorkflowModule],
  controllers: [CasesController],
  providers: [CasesService],
  exports: [CasesService],
})
export class CasesModule {}
