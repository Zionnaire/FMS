import { Module } from '@nestjs/common';
import { CasesModule } from '../cases/cases.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { RecoveryController, RecoveryQueueController } from './recovery.controller';
import { RecoveryService } from './recovery.service';

/** Imports both `CasesModule` (case access checks) and `WorkflowModule` (`ApprovalService.
 * assertApproved`, the CD-04 `LOSS_WRITE_OFF` gate) directly — a one-directional leaf, same
 * shape as `ContainmentModule`; nothing in `cases` or `workflow` needs anything from `recovery`,
 * so there's no circularity to design around. */
@Module({
  imports: [CasesModule, WorkflowModule],
  controllers: [RecoveryController, RecoveryQueueController],
  providers: [RecoveryService],
  exports: [RecoveryService],
})
export class RecoveryModule {}
