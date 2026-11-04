import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OnEvent } from '@nestjs/event-emitter';
import { Notification, NotificationChannel, NotificationPriority, Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { RealtimeService } from '../../infrastructure/realtime/realtime.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user.interface';
import {
  APPROVAL_DECIDED_EVENT,
  APPROVAL_REQUESTED_EVENT,
  ApprovalDecidedEvent,
  ApprovalRequestedEvent,
  CASE_STATUS_CHANGED_EVENT,
  CaseStatusChangedEvent,
  SLA_CLOCK_BREACHED_EVENT,
  SlaClockBreachedEvent,
} from '../../common/events/domain-events';
import { TeamsService } from '../identity/teams.service';
import { UsersService } from '../identity/users.service';
import { ListNotificationsDto } from './dto/list-notifications.dto';

/** HIGH-priority notifications unread past this window get an escalation delivery on a second
 * channel (see `escalateUnread`) — architecture.md's "escalation" for this module, in its
 * simplest workable form. */
const ESCALATION_WINDOW_MINUTES = 15;

/**
 * Owns `Notification`/`NotificationDelivery`. Every `@OnEvent` handler here is the ONLY thing
 * that couples this module to the event *names* other modules emit (via
 * `src/common/events/domain-events.ts`) — never to their services directly; `notifications`
 * imports `IdentityModule` only for the two narrow cross-module reads it needs to resolve
 * *recipients* (`UsersService.listActiveUserIdsByRole`, `TeamsService.listMemberIds`), not
 * because it depends on `workflow` or `cases` as modules.
 *
 * "Templates" (architecture.md's word) are the inline title/body construction in each handler
 * below, not a database table — same reasoning as `workflow`'s hardcoded `APPROVAL_MATRIX`:
 * nothing reads or writes a template through an API yet, so a real template-management table
 * would be built ahead of any actual need.
 *
 * "Delivery" beyond IN_APP (the `Notification` row itself, pushed live via `RealtimeService`) is
 * stubbed — every `NotificationDelivery` resolves immediately as SENT with no real external
 * provider call, logged instead. Swapping in a real provider (email/SMS/push) later replaces
 * `deliverExternal`'s body, not this service's public shape or the schema — the same
 * "build the seam now, wire the real thing in later" pattern this codebase already used for
 * `ml-gateway` not calling Groq yet.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeService: RealtimeService,
    private readonly usersService: UsersService,
    private readonly teamsService: TeamsService,
  ) {}

  async list(actor: AuthenticatedUser, query: ListNotificationsDto): Promise<{ notifications: Notification[]; total: number }> {
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const where = { userId: actor.sub, readAt: query.unreadOnly ? null : undefined };

    const [notifications, total] = await this.prisma.forCurrentTenant((tx) =>
      Promise.all([
        tx.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit, skip: offset }),
        tx.notification.count({ where }),
      ]),
    );

    return { notifications, total };
  }

  async markRead(actor: AuthenticatedUser, id: string): Promise<Notification> {
    const notification = await this.prisma.forCurrentTenant((tx) => tx.notification.findUnique({ where: { id } }));
    if (!notification || notification.userId !== actor.sub) {
      // Same id-but-not-yours shape as every other "not found vs. not yours" case in this
      // codebase — 404, not 403: a notification's existence isn't itself sensitive information
      // worth confirming to someone it doesn't belong to.
      throw new NotFoundException('Notification not found');
    }
    if (notification.readAt) {
      return notification;
    }
    return this.prisma.forCurrentTenant((tx) => tx.notification.update({ where: { id }, data: { readAt: new Date() } }));
  }

  @OnEvent(APPROVAL_REQUESTED_EVENT)
  async handleApprovalRequested(event: ApprovalRequestedEvent): Promise<void> {
    await this.safely('approval.requested', async () => {
      for (const userId of event.notifyUserIds) {
        await this.createAndDeliver(event.tenantId, userId, {
          type: 'approval.requested',
          priority: NotificationPriority.HIGH,
          title: 'Approval requested',
          body: `A ${event.action.replace(/_/g, ' ').toLowerCase()} approval (${event.severityBand.replace('_', '/')}) is waiting on your decision.`,
          metadata: { caseId: event.caseId, approvalId: event.approvalId, action: event.action, severityBand: event.severityBand },
        });
      }
    });
  }

  @OnEvent(APPROVAL_DECIDED_EVENT)
  async handleApprovalDecided(event: ApprovalDecidedEvent): Promise<void> {
    await this.safely('approval.decided', async () => {
      await this.createAndDeliver(event.tenantId, event.requestedBy, {
        type: 'approval.decided',
        priority: NotificationPriority.NORMAL,
        title: `Approval ${event.status.toLowerCase()}`,
        body: `Your ${event.action.replace(/_/g, ' ').toLowerCase()} approval request was ${event.status.toLowerCase()}.`,
        metadata: { caseId: event.caseId, approvalId: event.approvalId, status: event.status },
      });
    });
  }

  @OnEvent(CASE_STATUS_CHANGED_EVENT)
  async handleCaseStatusChanged(event: CaseStatusChangedEvent): Promise<void> {
    // Only closure is noteworthy enough to notify on for MVP — every other transition
    // (OPEN -> UNDER_INVESTIGATION, ON_HOLD, etc.) is routine case administration that would
    // just add noise; see the module's own README section for this as a deliberate scope call.
    if (event.toStatus !== 'CLOSED' || !event.assignedTeamId) {
      return;
    }
    await this.safely('case.status_changed', async () => {
      const memberIds = await this.teamsService.listMemberIds(event.assignedTeamId!);
      for (const userId of memberIds) {
        if (userId === event.changedBy) {
          continue;
        }
        await this.createAndDeliver(event.tenantId, userId, {
          type: 'case.closed',
          priority: NotificationPriority.NORMAL,
          title: 'Case closed',
          body: `Case ${event.referenceCode} was closed.`,
          metadata: { caseId: event.caseId, referenceCode: event.referenceCode },
        });
      }
    });
  }

  @OnEvent(SLA_CLOCK_BREACHED_EVENT)
  async handleSlaClockBreached(event: SlaClockBreachedEvent): Promise<void> {
    await this.safely('sla_clock.breached', async () => {
      // No per-incident owner to notify yet (no case-team link exists until an incident is
      // linked to a case) — FRAUD_RISK_MANAGER is the broadest role with a plausible standing
      // interest in every SLA breach, matching how ELEVATED_ROLES/APPROVAL_MATRIX already use
      // that role as the general fraud-ops oversight stand-in elsewhere in this codebase.
      const managerIds = await this.usersService.listActiveUserIdsByRole('FRAUD_RISK_MANAGER');
      for (const userId of managerIds) {
        await this.createAndDeliver(event.tenantId, userId, {
          type: 'sla_clock.breached',
          priority: NotificationPriority.HIGH,
          title: 'SLA breached',
          body: `An SLA clock on incident ${event.incidentId} has passed its target deadline.`,
          metadata: { incidentId: event.incidentId, clockId: event.clockId, targetDeadline: event.targetDeadline },
        });
      }
    });
  }

  /** Creates the IN_APP notification (the row itself) and pushes it live — the one delivery
   * path that's genuinely real, not stubbed, since it needs no external provider. */
  private async createAndDeliver(
    tenantId: string,
    userId: string,
    input: { type: string; priority: NotificationPriority; title: string; body: string; metadata: Prisma.InputJsonValue },
  ): Promise<Notification> {
    const notification = await this.prisma.withTenant(tenantId, (tx) =>
      tx.notification.create({
        data: { tenantId, userId, type: input.type, priority: input.priority, title: input.title, body: input.body, metadata: input.metadata },
      }),
    );

    this.realtimeService.emitToUser(userId, 'notification.created', notification);

    return notification;
  }

  /** Stub external delivery — logs instead of calling a real provider. See the class doc
   * comment for why, and `docs/CHANGELOG.md`'s `notifications` entry for the explicit decision
   * to build this seam now rather than block on provider credentials. */
  private async deliverExternal(tenantId: string, notificationId: string, channel: NotificationChannel, isEscalation: boolean): Promise<void> {
    this.logger.log(`[STUB] Would deliver notification ${notificationId} via ${channel}${isEscalation ? ' (escalation)' : ''}.`);
    await this.prisma.withTenant(tenantId, (tx) =>
      tx.notificationDelivery.create({
        data: { tenantId, notificationId, channel, status: 'SENT', isEscalation },
      }),
    );
  }

  /**
   * Every unread HIGH-priority notification older than `ESCALATION_WINDOW_MINUTES` with no
   * escalation delivery yet gets one (EMAIL, stubbed). Same "no ambient tenant context in a
   * scheduled job" reasoning as `SlaClockService.sweepBreachedClocks` — lists tenants directly
   * and uses `withTenant` explicitly per tenant.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async escalateUnread(): Promise<void> {
    const tenants = await this.prisma.tenant.findMany({ select: { id: true } });
    const cutoff = new Date(Date.now() - ESCALATION_WINDOW_MINUTES * 60000);

    for (const tenant of tenants) {
      const candidates = await this.prisma.withTenant(tenant.id, (tx) =>
        tx.notification.findMany({
          where: {
            tenantId: tenant.id,
            priority: NotificationPriority.HIGH,
            readAt: null,
            createdAt: { lt: cutoff },
            deliveries: { none: { isEscalation: true } },
          },
        }),
      );

      for (const notification of candidates) {
        await this.deliverExternal(tenant.id, notification.id, 'EMAIL', true);
      }

      if (candidates.length > 0) {
        this.logger.log(`Escalated ${candidates.length} unread HIGH-priority notification(s) for tenant ${tenant.id}.`);
      }
    }
  }

  /** Every `@OnEvent` handler runs this way — `EventEmitter2.emit()` (used by every emitter in
   * this codebase) is fire-and-forget by default, so an unhandled rejection here would surface
   * as an unhandled-promise-rejection at the process level, not as a failed request anywhere a
   * caller could see or retry it. Logged and swallowed instead: a failed notification must never
   * be allowed to look like a failed approval/case/SLA action to whoever triggered the real one. */
  private async safely(label: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      this.logger.error(`Notification handler failed for event "${label}"`, err as Error);
    }
  }
}
