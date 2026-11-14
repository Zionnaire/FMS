import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuditOutcome, SlaClock, SlaClockStatus } from '@prisma/client';
import { PrismaService, TenantScopedClient } from '../../infrastructure/database/prisma.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user.interface';
import { SLA_CLOCK_BREACHED_EVENT, SlaClockBreachedEvent } from '../../common/events/domain-events';
import { AuditService } from '../audit/audit.service';
import { IncidentsService } from '../incidents/incidents.service';
import { TriageService } from '../triage/triage.service';
import { PauseSlaClockDto } from './dto/pause-sla-clock.dto';
import { StartSlaClockDto } from './dto/start-sla-clock.dto';

export interface SlaClockWithStatus extends SlaClock {
  isBreached: boolean;
  remainingMs: number | null;
}

/**
 * Owns `SlaClock`. Anchored to Incident (not Case) because severity/calendar — the two inputs
 * an SLA clock needs — already live on TriageAssessment, which is per-incident. See the doc
 * comment on `SlaClock` in schema.prisma for why `targetDeadline` is caller-supplied rather than
 * derived from CD-02.
 */
@Injectable()
export class SlaClockService {
  private readonly logger = new Logger(SlaClockService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly incidentsService: IncidentsService,
    private readonly triageService: TriageService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async start(actor: AuthenticatedUser, incidentId: string, dto: StartSlaClockDto): Promise<SlaClock> {
    await this.incidentsService.getById(actor, incidentId);

    const active = await this.getActiveOrNull(incidentId);
    if (active) {
      throw new BadRequestException('This incident already has a running or paused SLA clock');
    }

    // Throws NotFoundException itself (clear enough as-is: "No triage assessment exists for
    // this incident yet") if the incident hasn't been triaged — a clock needs a calendar, and
    // the calendar only exists once triage has assigned one.
    const assessment = await this.triageService.getCurrent(actor, incidentId);

    const clock = await this.prisma.forCurrentTenant((tx) =>
      tx.slaClock.create({
        data: {
          tenantId: actor.tenantId,
          incidentId,
          calendarName: assessment.slaCalendarName,
          targetDeadline: new Date(dto.targetDeadline),
          startedBy: actor.sub,
        },
      }),
    );

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'workflow.sla_clock.start',
      entityType: 'SlaClock',
      entityId: clock.id,
      outcome: AuditOutcome.SUCCESS,
      metadata: { incidentId, calendarName: clock.calendarName, targetDeadline: dto.targetDeadline },
    });

    return clock;
  }

  async pause(actor: AuthenticatedUser, clockId: string, dto: PauseSlaClockDto): Promise<SlaClock> {
    const clock = await this.findOrThrow(actor, clockId);
    if (clock.status !== SlaClockStatus.RUNNING) {
      throw new BadRequestException(`Clock is ${clock.status.toLowerCase()} — only a RUNNING clock can be paused`);
    }

    const updated = await this.prisma.forCurrentTenant((tx) =>
      tx.slaClock.update({
        where: { id: clockId },
        data: { status: SlaClockStatus.PAUSED, pausedBy: actor.sub, pausedAt: new Date(), pauseReason: dto.reason },
      }),
    );

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'workflow.sla_clock.pause',
      entityType: 'SlaClock',
      entityId: clockId,
      outcome: AuditOutcome.SUCCESS,
      metadata: { reason: dto.reason },
    });

    return updated;
  }

  async resume(actor: AuthenticatedUser, clockId: string): Promise<SlaClock> {
    const clock = await this.findOrThrow(actor, clockId);
    if (clock.status !== SlaClockStatus.PAUSED || !clock.pausedAt) {
      throw new BadRequestException(`Clock is ${clock.status.toLowerCase()} — only a PAUSED clock can be resumed`);
    }

    const pausedMinutes = Math.round((Date.now() - clock.pausedAt.getTime()) / 60000);

    const updated = await this.prisma.forCurrentTenant((tx) =>
      tx.slaClock.update({
        where: { id: clockId },
        data: {
          status: SlaClockStatus.RUNNING,
          pausedBy: null,
          pausedAt: null,
          pauseReason: null,
          totalPausedMinutes: clock.totalPausedMinutes + pausedMinutes,
        },
      }),
    );

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'workflow.sla_clock.resume',
      entityType: 'SlaClock',
      entityId: clockId,
      outcome: AuditOutcome.SUCCESS,
      metadata: { pausedMinutes },
    });

    return updated;
  }

  async stop(actor: AuthenticatedUser, clockId: string): Promise<SlaClock> {
    const clock = await this.findOrThrow(actor, clockId);
    if (clock.status === SlaClockStatus.STOPPED) {
      return clock;
    }

    const updated = await this.prisma.forCurrentTenant((tx) =>
      tx.slaClock.update({
        where: { id: clockId },
        data: { status: SlaClockStatus.STOPPED, stoppedBy: actor.sub, stoppedAt: new Date() },
      }),
    );

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'workflow.sla_clock.stop',
      entityType: 'SlaClock',
      entityId: clockId,
      outcome: AuditOutcome.SUCCESS,
    });

    return updated;
  }

  async getCurrent(actor: AuthenticatedUser, incidentId: string): Promise<SlaClockWithStatus> {
    await this.incidentsService.getById(actor, incidentId);

    const clock = await this.prisma.forCurrentTenant((tx) =>
      tx.slaClock.findFirst({ where: { incidentId }, orderBy: { startedAt: 'desc' } }),
    );
    if (!clock) {
      throw new NotFoundException('No SLA clock exists for this incident yet');
    }

    return this.withComputedStatus(clock);
  }

  /** Batched "which of these incidents has a currently-breached clock" — added for
   * `CasesService.list`/`stats`'s per-case overdue rollup (there is no case-level SLA clock,
   * only one per incident — see this class's own doc comment). This module owns `SlaClock`, so
   * this is the one place allowed to query it directly, same reasoning as `TriageService.
   * getLatestSeverityByIncidentIds`. No visibility check here: the caller is responsible for
   * only passing incident ids its own actor can already see. Same one-line breach formula
   * `withComputedStatus` already uses, just applied to a batch and reduced to the breached ids.
   *
   * Optional `tx`: see `TriageService.getLatestSeverityByIncidentIds`'s own doc comment — same
   * "share the caller's transaction instead of opening a second one" reasoning. */
  async getBreachedIncidentIds(incidentIds: string[], tx?: TenantScopedClient): Promise<Set<string>> {
    if (incidentIds.length === 0) return new Set();
    const query = (client: TenantScopedClient) =>
      client.slaClock.findMany({
        where: { incidentId: { in: incidentIds }, status: { not: SlaClockStatus.STOPPED } },
        select: { incidentId: true, targetDeadline: true },
      });
    const clocks = tx ? await query(tx) : await this.prisma.forCurrentTenant(query);
    const now = Date.now();
    return new Set(clocks.filter((c) => now > c.targetDeadline.getTime()).map((c) => c.incidentId));
  }

  private withComputedStatus(clock: SlaClock): SlaClockWithStatus {
    const isBreached = clock.status !== SlaClockStatus.STOPPED && Date.now() > clock.targetDeadline.getTime();
    const remainingMs = clock.status === SlaClockStatus.STOPPED ? null : clock.targetDeadline.getTime() - Date.now();
    return { ...clock, isBreached, remainingMs };
  }

  private async getActiveOrNull(incidentId: string): Promise<SlaClock | null> {
    return this.prisma.forCurrentTenant((tx) =>
      tx.slaClock.findFirst({
        where: { incidentId, status: { in: [SlaClockStatus.RUNNING, SlaClockStatus.PAUSED] } },
      }),
    );
  }

  private async findOrThrow(actor: AuthenticatedUser, clockId: string): Promise<SlaClock> {
    const clock = await this.prisma.forCurrentTenant((tx) => tx.slaClock.findUnique({ where: { id: clockId } }));
    if (!clock) {
      throw new NotFoundException('SLA clock not found');
    }
    // Confirms the actor can see the incident this clock belongs to — reuses
    // IncidentsService.getById's own compartment-visibility check rather than duplicating it.
    await this.incidentsService.getById(actor, clock.incidentId);
    return clock;
  }

  /**
   * Runs outside any HTTP request — no AsyncLocalStorage tenant context exists here, so unlike
   * every other method on this service, this one can't use `forCurrentTenant()`. It lists
   * tenants directly (the same "control plane, not RLS-scoped" query `AuthService.login` uses
   * for the same structural reason) and uses `withTenant(tenantId, ...)` explicitly per tenant.
   * Single-instance-only: see `ScheduleModule`'s registration in `app.module.ts` for why running
   * this on more than one instance isn't handled (yet).
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async sweepBreachedClocks(): Promise<void> {
    const tenants = await this.prisma.tenant.findMany({ select: { id: true } });

    for (const tenant of tenants) {
      const breached = await this.prisma.withTenant(tenant.id, (tx) =>
        tx.slaClock.findMany({
          where: {
            tenantId: tenant.id,
            status: { in: [SlaClockStatus.RUNNING, SlaClockStatus.PAUSED] },
            targetDeadline: { lt: new Date() },
            breachNotifiedAt: null,
          },
        }),
      );

      for (const clock of breached) {
        await this.prisma.withTenant(tenant.id, (tx) =>
          tx.slaClock.update({ where: { id: clock.id }, data: { breachNotifiedAt: new Date() } }),
        );

        await this.auditService.record({
          tenantId: tenant.id,
          action: 'workflow.sla_clock.breach_detected',
          entityType: 'SlaClock',
          entityId: clock.id,
          outcome: AuditOutcome.FAILURE,
          metadata: { incidentId: clock.incidentId, targetDeadline: clock.targetDeadline.toISOString() },
        });

        this.eventEmitter.emit(SLA_CLOCK_BREACHED_EVENT, {
          tenantId: tenant.id,
          clockId: clock.id,
          incidentId: clock.incidentId,
          targetDeadline: clock.targetDeadline.toISOString(),
        } satisfies SlaClockBreachedEvent);
      }

      if (breached.length > 0) {
        this.logger.warn(`Detected ${breached.length} newly-breached SLA clock(s) for tenant ${tenant.id}.`);
      }
    }
  }
}
