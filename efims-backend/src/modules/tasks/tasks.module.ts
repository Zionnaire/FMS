import { Module } from '@nestjs/common';
import { CasesModule } from '../cases/cases.module';
import { IdentityModule } from '../identity/identity.module';
import { TasksController, TasksQueueController } from './tasks.controller';
import { TasksService } from './tasks.service';

/** Imports `CasesModule` (case access checks) and `IdentityModule` (`UsersService.
 * assertUserExists`, validating `CreateTaskDto.assigneeUserId`) directly — a one-directional
 * leaf, same shape as `CapaModule`. */
@Module({
  imports: [CasesModule, IdentityModule],
  controllers: [TasksController, TasksQueueController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
