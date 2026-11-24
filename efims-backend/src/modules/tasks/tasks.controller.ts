import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.interface';
import { CASE_ROLES, EXCEPT_REPORTER_ROLES } from '../../common/constants/roles';
import { CancelTaskDto } from './dto/cancel-task.dto';
import { CreateTaskDto } from './dto/create-task.dto';
import { TasksService } from './tasks.service';

/** `CASE_ROLES` now lives in `common/constants/roles.ts`. Reads carry no `@Roles()` gate of their
 * own — `TasksService` delegates to `CasesService.getById` for the check that actually matters,
 * same pattern as every other case-scoped controller in this codebase. */

@Controller('cases/:caseId/tasks')
@UseGuards(RolesGuard)
@Roles(...EXCEPT_REPORTER_ROLES)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(...CASE_ROLES)
  create(@CurrentUser() actor: AuthenticatedUser, @Param('caseId', ParseUUIDPipe) caseId: string, @Body() dto: CreateTaskDto) {
    return this.tasksService.create(actor, caseId, dto);
  }

  @Get()
  list(@CurrentUser() actor: AuthenticatedUser, @Param('caseId', ParseUUIDPipe) caseId: string) {
    return this.tasksService.list(actor, caseId);
  }

  @Post(':taskId/complete')
  @UseGuards(RolesGuard)
  @Roles(...CASE_ROLES)
  complete(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ) {
    return this.tasksService.complete(actor, caseId, taskId);
  }

  @Post(':taskId/cancel')
  @UseGuards(RolesGuard)
  @Roles(...CASE_ROLES)
  cancel(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: CancelTaskDto,
  ) {
    return this.tasksService.cancel(actor, caseId, taskId, dto);
  }
}

/** Separate, root-level controller for the top-level Tasks tab's cross-case register (same
 * reasoning as `EvidenceQueueController`/`ContainmentQueueController`): no `@Roles()` gate, access
 * enforced purely via `getVisibleCaseIds` filtering inside `listAll`. */
@Controller('tasks')
@UseGuards(RolesGuard)
@Roles(...EXCEPT_REPORTER_ROLES)
export class TasksQueueController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  listAll(@CurrentUser() actor: AuthenticatedUser) {
    return this.tasksService.listAll(actor);
  }
}
