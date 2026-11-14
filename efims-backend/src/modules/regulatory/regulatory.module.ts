import { Module } from '@nestjs/common';
import { CasesModule } from '../cases/cases.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { RegulatoryController, RegulatoryQueueController } from './regulatory.controller';
import { RegulatoryService } from './regulatory.service';

/** Imports both `CasesModule` (case access checks) and `WorkflowModule` (`ApprovalService.
 * assertApproved`, the CD-04 `REGULATORY_SUBMISSION` gate) directly — a one-directional leaf,
 * same shape as `ContainmentModule`/`RecoveryModule`. */
@Module({
  imports: [CasesModule, WorkflowModule],
  controllers: [RegulatoryController, RegulatoryQueueController],
  providers: [RegulatoryService],
  exports: [RegulatoryService],
})
export class RegulatoryModule {}
