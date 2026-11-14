import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuditOutcome, Task, TaskStatus } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user.interface';
import { TASK_ASSIGNED_EVENT, TaskAssignedEvent } from '../../common/events/domain-events';
import { AuditService } from '../audit/audit.service';
import { CasesService } from '../cases/cases.service';
import { UsersService } from '../identity/users.service';
import { CancelTaskDto } from './dto/cancel-task.dto';
import { CreateTaskDto } from './dto/create-task.dto';

/**
 * Owns `Task` — a freestanding, case-scoped to-do ("call the cardholder by Friday"), deliberately
 * NOT a parallel mutable copy of `CapaAction`/`InvestigationIssue`/`ApprovalRequest`/
 * `ContainmentRequest`'s own lifecycles (see the model's own doc comment in schema.prisma for why
 * a generic "mark done" action is unsafe for those four). `listAll` here only ever returns real
 * `Task` rows; the cross-case "Tasks" view the frontend builds is a union of this register with
 * those four modules' own existing registers, not something this service knows about.
 *
 * Same discipline as every other case-scoped module: `casesService.getById` first on every method,
 * `AuditService.record` after every write, `getVisibleCaseIds`-based `listAll` for the cross-case
 * register.
 */
@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly casesService: CasesService,
    private readonly usersService: UsersService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(actor: AuthenticatedUser, caseId: string, dto: CreateTaskDto): Promise<Task> {
    await this.casesService.getById(actor, caseId);
    await this.usersService.assertUserExists(dto.assigneeUserId);

    const created = await this.prisma.forCurrentTenant((tx) =>
      tx.task.create({
        data: {
          tenantId: actor.tenantId,
          caseId,
          title: dto.title,
          description: dto.description,
          priority: dto.priority,
          assigneeUserId: dto.assigneeUserId,
          dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
          createdBy: actor.sub,
        },
      }),
    );

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'tasks.task.create',
      entityType: 'Task',
      entityId: created.id,
      outcome: AuditOutcome.SUCCESS,
      metadata: { caseId, assigneeUserId: created.assigneeUserId, dueAt: created.dueAt },
    });

    this.eventEmitter.emit(TASK_ASSIGNED_EVENT, {
      tenantId: actor.tenantId,
      taskId: created.id,
      caseId,
      title: created.title,
      assigneeUserId: created.assigneeUserId,
      dueAt: created.dueAt ? created.dueAt.toISOString() : null,
      assignedBy: actor.sub,
    } satisfies TaskAssignedEvent);

    return created;
  }

  async list(actor: AuthenticatedUser, caseId: string): Promise<Task[]> {
    await this.casesService.getById(actor, caseId);
    return this.prisma.forCurrentTenant((tx) => tx.task.findMany({ where: { caseId }, orderBy: { dueAt: 'asc' } }));
  }

  async complete(actor: AuthenticatedUser, caseId: string, taskId: string): Promise<Task> {
    await this.casesService.getById(actor, caseId);
    const task = await this.assertTaskOnCase(caseId, taskId);
    this.assertStillOpen(task);

    const updated = await this.prisma.forCurrentTenant((tx) =>
      tx.task.update({ where: { id: taskId }, data: { status: TaskStatus.DONE, completedAt: new Date() } }),
    );

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'tasks.task.complete',
      entityType: 'Task',
      entityId: taskId,
      outcome: AuditOutcome.SUCCESS,
      metadata: { caseId },
    });

    return updated;
  }

  async cancel(actor: AuthenticatedUser, caseId: string, taskId: string, dto: CancelTaskDto): Promise<Task> {
    await this.casesService.getById(actor, caseId);
    const task = await this.assertTaskOnCase(caseId, taskId);
    this.assertStillOpen(task);

    const updated = await this.prisma.forCurrentTenant((tx) =>
      tx.task.update({
        where: { id: taskId },
        data: { status: TaskStatus.CANCELLED, cancelledReason: dto.reason, cancelledAt: new Date() },
      }),
    );

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'tasks.task.cancel',
      entityType: 'Task',
      entityId: taskId,
      outcome: AuditOutcome.SUCCESS,
      metadata: { caseId, reason: dto.reason },
    });

    return updated;
  }

  /** General cross-case register for the top-level Tasks tab — every freestanding task across
   * every accessible case. Not every "task-shaped" thing in the app: see this module's own doc
   * comment for why the other three gated entities are merged in by the caller, not here. */
  async listAll(actor: AuthenticatedUser): Promise<(Task & { case: { referenceCode: string; title: string } })[]> {
    const visibleCaseIds = await this.casesService.getVisibleCaseIds(actor);
    if (visibleCaseIds.length === 0) return [];

    return this.prisma.forCurrentTenant((tx) =>
      tx.task.findMany({
        where: { caseId: { in: visibleCaseIds } },
        include: { case: { select: { referenceCode: true, title: true } } },
        orderBy: { dueAt: 'asc' },
      }),
    );
  }

  private async assertTaskOnCase(caseId: string, taskId: string): Promise<Task> {
    const task = await this.prisma.forCurrentTenant((tx) => tx.task.findUnique({ where: { id: taskId } }));
    if (!task || task.caseId !== caseId) {
      throw new NotFoundException('Task not found on this case');
    }
    return task;
  }

  private assertStillOpen(task: Task): void {
    if (task.status !== TaskStatus.OPEN) {
      throw new BadRequestException(`This task is already ${task.status.toLowerCase()}`);
    }
  }
}
