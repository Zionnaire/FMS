import { Module } from '@nestjs/common';
import { CasesModule } from '../cases/cases.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { ContainmentController } from './containment.controller';
import { ContainmentService } from './containment.service';

/** Imports both `CasesModule` (case access checks) and `WorkflowModule` (`ApprovalService.
 * assertApproved`, the CD-04 gate) directly — a one-directional leaf, same shape as
 * `InvestigationsModule`/`EvidenceModule`; nothing in `cases` or `workflow` needs anything from
 * `containment`, so there's no circularity to design around. */
@Module({
  imports: [CasesModule, WorkflowModule],
  controllers: [ContainmentController],
  providers: [ContainmentService],
  exports: [ContainmentService],
})
export class ContainmentModule {}
