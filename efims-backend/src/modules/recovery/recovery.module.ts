import { Module } from '@nestjs/common';
import { CasesModule } from '../cases/cases.module';
import { MlGatewayModule } from '../ml-gateway/ml-gateway.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { RecoveryController, RecoveryQueueController } from './recovery.controller';
import { RecoveryService } from './recovery.service';

/** Imports `CasesModule` (case access checks), `WorkflowModule` (`ApprovalService.
 * assertApproved`, the CD-04 `LOSS_WRITE_OFF` gate), and `MlGatewayModule` (`predictRecovery`)
 * directly — a one-directional leaf, same shape as `ContainmentModule`; nothing in `cases`/
 * `workflow`/`ml-gateway` needs anything from `recovery`, so there's no circularity to design
 * around. */
@Module({
  imports: [CasesModule, WorkflowModule, MlGatewayModule],
  controllers: [RecoveryController, RecoveryQueueController],
  providers: [RecoveryService],
  exports: [RecoveryService],
})
export class RecoveryModule {}
