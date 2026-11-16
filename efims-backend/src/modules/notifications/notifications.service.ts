import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OnEvent } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
// `web-push` ships ESM-only (`"type": "module"`, confirmed live — see this file's own doc
// comment on `webpushModule` below for the full story). A regular top-level `import` here would
// compile to a `require()` call that crashes the compiled build with `ERR_REQUIRE_ESM` the moment
// this module is ever imported, not just when push is actually used — so this is `import type`
// only (erased by the compiler, no runtime `require()`) purely for the type annotation below.
import type * as WebPushModule from 'web-push';

/** A plain `import('web-push')` expression doesn't survive TypeScript's CommonJS emit unchanged
 * — confirmed live by reading the actual compiled `dist/` output: TS rewrites it into
 * `Promise.resolve().then(() => require('web-push'))`, which still calls `require()` on an
 * ESM-only package and still throws `ERR_REQUIRE_ESM`, just one microtask later than a plain
 * top-level import would have. Hiding the import behind `new Function` keeps the literal text
 * `import(...)` inside a string the compiler never parses as an AST node, so it can't rewrite it
 * — the function this constructs, once actually *called* at runtime, performs a genuine ES
 * dynamic import instead of a disguised `require()`. */
const dynamicImportWebPush = new Function('return import("web-push")') as () => Promise<typeof WebPushModule>;
import { Notification, NotificationChannel, NotificationPriority, Prisma, PushSubscription, Role } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { RealtimeService } from '../../infrastructure/realtime/realtime.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user.interface';
import {
  APPROVAL_DECIDED_EVENT,
  APPROVAL_REQUESTED_EVENT,
  ApprovalDecidedEvent,
  ApprovalRequestedEvent,
  CASE_ESCALATED_EVENT,
  CASE_STATUS_CHANGED_EVENT,
  CaseEscalatedEvent,
  CaseStatusChangedEvent,
  SLA_CLOCK_BREACHED_EVENT,
  SlaClockBreachedEvent,
  TASK_ASSIGNED_EVENT,
  TaskAssignedEvent,
} from '../../common/events/domain-events';
import { TeamsService } from '../identity/teams.service';
import { UsersService } from '../identity/users.service';
import { ListNotificationsDto } from './dto/list-notifications.dto';
import { SubscribePushDto } from './dto/subscribe-push.dto';

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
  private readonly pushConfigured: boolean;

  /** `web-push@4` is ESM-only (`"type": "module"` in its own package.json, no CommonJS build at
   * all) — found live, not in local dev: `nest start --watch` tolerated a plain top-level
   * `import * as webpush from 'web-push'` (its ts-node/SWC-based dev loader is more lenient
   * about this than plain Node is), but the exact same code crashed the real compiled build the
   * moment Render ran `node dist/main.js`: `Error [ERR_REQUIRE_ESM]: require() of ES Module
   * .../web-push/src/index.js ... not supported`. A static import of an ESM package compiles to
   * a `require()` call under this project's CommonJS build target, which Node flatly refuses for
   * an ESM-only package — there is no `esModuleInterop`/`allowSyntheticDefaultImports` escape
   * hatch for this specific case, since those only paper over a *default*-export shape mismatch,
   * not a genuine CJS/ESM loader incompatibility. Node's own error message says exactly the fix:
   * "change the require ... to a dynamic import()" — resolved once, lazily, and cached here so
   * every other call site just `await`s this instead of re-importing per send. */
  private webpushModule: Promise<typeof WebPushModule> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeService: RealtimeService,
    private readonly usersService: UsersService,
    private readonly teamsService: TeamsService,
    private readonly config: ConfigService,
  ) {
    // Set once, not per-send — `web-push` keeps these module-level, and every `sendNotification`
    // call after this uses them automatically. Missing keys mean PUSH degrades to the same logged
    // stub EMAIL/SMS already are (see `deliverExternal`), not a startup crash — this module has to
    // keep working in any environment that hasn't generated a VAPID pair yet.
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY');
    const subject = this.config.get<string>('VAPID_SUBJECT');
    this.pushConfigured = Boolean(publicKey && privateKey && subject);
    if (this.pushConfigured) {
      this.webpushModule = dynamicImportWebPush().then((mod) => {
        mod.setVapidDetails(subject!, publicKey!, privateKey!);
        return mod;
      });
    } else {
      this.logger.warn('VAPID keys not configured — push notifications will be logged, not sent. See .env.example.');
    }
  }

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

  /** Emits `notification.read` to the owning user's realtime room after a successful update — the
   * only way `NotificationBellBadge`'s own unread count (a separate socket consumer from
   * `NotificationsLiveList`, by this module's own established "each consumer opens its own
   * connection" pattern) ever finds out a notification was read, including from the list page in
   * the same tab, another tab, or another device. Without this, the badge's count only ever grows
   * — a real bug found live, not a guess (see `docs/CHANGELOG.md`'s dated entry). */
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
    const updated = await this.prisma.forCurrentTenant((tx) => tx.notification.update({ where: { id }, data: { readAt: new Date() } }));
    this.realtimeService.emitToUser(actor.sub, 'notification.read', { id: updated.id });
    return updated;
  }

  /** Upsert by `endpoint` (its own unique key — see `PushSubscription`'s schema.prisma doc
   * comment): a browser re-subscribing after e.g. clearing site data produces a fresh `endpoint`,
   * so this never collides with a stale row left behind by that; a browser re-subscribing without
   * clearing anything reuses the SAME `endpoint`, so this updates its keys in place instead of
   * erroring on the unique constraint. */
  async subscribeToPush(actor: AuthenticatedUser, dto: SubscribePushDto): Promise<void> {
    await this.prisma.forCurrentTenant((tx) =>
      tx.pushSubscription.upsert({
        where: { endpoint: dto.endpoint },
        create: { tenantId: actor.tenantId, userId: actor.sub, endpoint: dto.endpoint, p256dh: dto.keys.p256dh, auth: dto.keys.auth },
        update: { p256dh: dto.keys.p256dh, auth: dto.keys.auth },
      }),
    );
  }

  /** No ownership check beyond RLS's tenant scoping — `endpoint` is a long, unguessable URL the
   * push service itself generated, not a sequential id; knowing it already proves this is either
   * the subscribing browser or something with equivalent access, same trust level this project
   * already gives a bearer access token. */
  async unsubscribeFromPush(actor: AuthenticatedUser, endpoint: string): Promise<void> {
    await this.prisma.forCurrentTenant((tx) => tx.pushSubscription.deleteMany({ where: { endpoint, userId: actor.sub } }));
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

  @OnEvent(TASK_ASSIGNED_EVENT)
  async handleTaskAssigned(event: TaskAssignedEvent): Promise<void> {
    if (event.assigneeUserId === event.assignedBy) {
      return;
    }
    await this.safely('task.assigned', async () => {
      await this.createAndDeliver(event.tenantId, event.assigneeUserId, {
        type: 'task.assigned',
        priority: NotificationPriority.NORMAL,
        title: 'Task assigned to you',
        body: event.dueAt ? `"${event.title}" is due ${new Date(event.dueAt).toLocaleDateString()}.` : `"${event.title}" was assigned to you.`,
        metadata: { caseId: event.caseId, taskId: event.taskId, dueAt: event.dueAt },
      });
    });
  }

  @OnEvent(CASE_ESCALATED_EVENT)
  async handleCaseEscalated(event: CaseEscalatedEvent): Promise<void> {
    await this.safely('case.escalated', async () => {
      for (const c of event.cases) {
        if (!c.assignedTeamId) continue; // nothing to notify — no team, no lead

        const [memberIds, leadIds] = await Promise.all([
          this.teamsService.listMemberIds(c.assignedTeamId),
          this.usersService.listActiveUserIdsByRole(Role.TEAM_LEAD),
        ]);
        const leadIdSet = new Set(leadIds);
        const teamLeadMemberIds = memberIds.filter((id) => leadIdSet.has(id));
        // Falls back to the whole team if none of its current members hold TEAM_LEAD — a case
        // with an assigned team but no identifiable lead shouldn't silently notify no one.
        const recipientIds = teamLeadMemberIds.length > 0 ? teamLeadMemberIds : memberIds;

        for (const userId of recipientIds) {
          if (userId === event.escalatedBy) continue;
          await this.createAndDeliver(event.tenantId, userId, {
            type: 'case.escalated',
            priority: NotificationPriority.HIGH,
            title: 'Case escalated',
            body: `Case ${c.referenceCode} was escalated: ${event.reason}`,
            metadata: { caseId: c.caseId, referenceCode: c.referenceCode, reason: event.reason },
          });
        }
      }
    });
  }

  /** Creates the IN_APP notification (the row itself), pushes it live, and — 2026-11-16 — fires
   * a real Web Push to every device this user has subscribed on (see `subscribeToPush`). Push
   * delivery is NOT awaited by this method: it's a real network call to an external push service
   * (Google FCM, Mozilla autopush, etc.) with no bound on latency, and every caller of this method
   * is already a loop over possibly many recipients (`handleCaseEscalated` etc.) that shouldn't
   * wait on it. `sendPush` catches its own errors internally, so this is never a silently-dropped
   * failure (same "accurate record even when fire-and-forget" reasoning as the rest of this
   * method's own delivery bookkeeping), just a not-blocking one. */
  private async createAndDeliver(
    tenantId: string,
    userId: string,
    input: { type: string; priority: NotificationPriority; title: string; body: string; metadata: Prisma.InputJsonValue },
  ): Promise<Notification> {
    const { notification, subscriptions } = await this.prisma.withTenant(tenantId, async (tx) => {
      const notification = await tx.notification.create({
        data: { tenantId, userId, type: input.type, priority: input.priority, title: input.title, body: input.body, metadata: input.metadata },
      });
      const subscriptions = await tx.pushSubscription.findMany({ where: { userId } });
      return { notification, subscriptions };
    });

    this.realtimeService.emitToUser(userId, 'notification.created', notification);

    if (subscriptions.length > 0) {
      void this.sendPush(tenantId, notification, subscriptions).catch((err) =>
        this.logger.error(`Unexpected error sending push for notification ${notification.id}`, err as Error),
      );
    }

    return notification;
  }

  /** Real delivery (not the stub below) — sends to every one of this user's subscribed devices
   * in parallel, since a failure on one device must never block or fail delivery to another.
   * `statusCode` 404/410 from the push service means that specific subscription no longer exists
   * on the browser's end (uninstalled, site data cleared, etc.) — pruned immediately rather than
   * retried forever. Falls back to the same log-only stub `deliverExternal` uses for EMAIL/SMS
   * when VAPID keys aren't configured (see the constructor), so this module keeps working in any
   * environment that hasn't generated a pair yet. */
  private async sendPush(tenantId: string, notification: Notification, subscriptions: PushSubscription[]): Promise<void> {
    if (!this.pushConfigured) {
      this.logger.log(`[STUB] Would push notification ${notification.id} to ${subscriptions.length} device(s) — VAPID keys not configured.`);
      await this.prisma.withTenant(tenantId, (tx) =>
        tx.notificationDelivery.create({ data: { tenantId, notificationId: notification.id, channel: 'PUSH', status: 'SENT', isEscalation: false } }),
      );
      return;
    }

    const webpush = await this.webpushModule;
    const payload = JSON.stringify({ title: notification.title, body: notification.body, notificationId: notification.id });
    const staleEndpoints: string[] = [];
    let anySent = false;

    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webpush!.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
          anySent = true;
        } catch (err) {
          const statusCode = (err as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            staleEndpoints.push(sub.endpoint);
          } else {
            this.logger.warn(`Push delivery failed for one subscription: ${(err as Error).message}`);
          }
        }
      }),
    );

    await this.prisma.withTenant(tenantId, async (tx) => {
      if (staleEndpoints.length > 0) {
        await tx.pushSubscription.deleteMany({ where: { endpoint: { in: staleEndpoints } } });
      }
      await tx.notificationDelivery.create({
        data: { tenantId, notificationId: notification.id, channel: 'PUSH', status: anySent ? 'SENT' : 'FAILED', isEscalation: false },
      });
    });
  }

  /** Stub external delivery — logs instead of calling a real provider. Still used for EMAIL/SMS
   * (see the class doc comment for why those stay stubbed) — PUSH has its own real path now,
   * `sendPush` above, called from `createAndDeliver` instead of here. */
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
   *
   * Wrapped in `safely()` — found live, not a guess: `@nestjs/schedule`'s `@Cron` has no built-in
   * error handling, so an unhandled rejection here (e.g. the Neon connection dropping mid-sweep,
   * a real, recurring characteristic of this dev environment — see `docs/CHANGELOG.md`'s dated
   * entries) crashes the entire Node process, not just this one tick. `safely()`'s own doc
   * comment already explains exactly this mechanism for `@OnEvent` handlers; this cron job was
   * the one place in this file that never got the same protection.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async escalateUnread(): Promise<void> {
    await this.safely('escalateUnread', async () => {
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
    });
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
