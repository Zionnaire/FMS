import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditOutcome, Compartment, Prisma, Role, Signal, SignalSource, SignalStatus } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user.interface';
import { DEFAULT_PAGE_SIZE } from '../../common/dto/pagination-query.dto';
import { AuditService } from '../audit/audit.service';
import { CreateSignalDto } from './dto/create-signal.dto';
import { RejectSignalDto } from './dto/reject-signal.dto';
import { ValidateSignalDto } from './dto/validate-signal.dto';
import { IncidentsService } from './incidents.service';
import { WhistleblowerVaultService } from './whistleblower-vault.service';

@Injectable()
export class SignalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly whistleblowerVault: WhistleblowerVaultService,
    private readonly incidentsService: IncidentsService,
  ) {}

  async create(actor: AuthenticatedUser, dto: CreateSignalDto): Promise<Signal> {
    return this.prisma.forCurrentTenant(async (tx) => {
      const signal = await tx.signal.create({
        data: {
          tenantId: actor.tenantId,
          source: dto.source,
          externalRef: dto.externalRef,
          summary: dto.summary,
          // Whistleblower identity never lands here, even if a caller tried to stuff it into
          // `payload` themselves — see the field-level comment on Signal.payload in
          // schema.prisma. `payload` is otherwise passed through as-is.
          payload: dto.payload as Prisma.InputJsonValue | undefined,
          reportedBy: actor.sub,
        },
      });

      if (dto.source === SignalSource.WHISTLEBLOWER) {
        await this.whistleblowerVault.createEntry(tx, actor.tenantId, signal.id, {
          isAnonymous: dto.isAnonymous ?? true,
          reporterName: dto.reporterName,
          reporterContact: dto.reporterContact,
        });
      }

      await this.auditService.record({
        tenantId: actor.tenantId,
        actorUserId: actor.sub,
        action: 'incidents.signal.create',
        entityType: 'Signal',
        entityId: signal.id,
        outcome: AuditOutcome.SUCCESS,
        metadata: { source: dto.source },
      });

      return signal;
    });
  }

  /**
   * `INCIDENT_REPORTER` gets `reportedBy` force-set to `actor.sub` here, overriding whatever the
   * caller passed — added 2026-11-24 after an RBAC audit found `reportedBy` was previously only
   * applied when the *caller* opted in (`?mine=true`), a client-side convenience, not a real
   * restriction: a raw API call omitting it returned every tenant signal to a reporter, who per
   * this project's own "own reports only, no enterprise case browsing" doctrine should never see
   * anyone else's. Every other role keeps the existing optional-`mine`-filter behavior.
   */
  async list(
    actor: AuthenticatedUser,
    status?: SignalStatus,
    limit = DEFAULT_PAGE_SIZE,
    offset = 0,
    source?: SignalSource,
    q?: string,
    reportedBy?: string,
  ): Promise<{ signals: Signal[]; total: number }> {
    const effectiveReportedBy = actor.role === Role.INCIDENT_REPORTER ? actor.sub : reportedBy;
    const where: Prisma.SignalWhereInput = {
      ...(status ? { status } : {}),
      ...(source ? { source } : {}),
      ...(q ? { summary: { contains: q, mode: 'insensitive' } } : {}),
      ...(effectiveReportedBy ? { reportedBy: effectiveReportedBy } : {}),
    };
    const [signals, total] = await this.prisma.forCurrentTenant((tx) =>
      Promise.all([
        tx.signal.findMany({ where, orderBy: { receivedAt: 'desc' }, take: limit, skip: offset }),
        tx.signal.count({ where }),
      ]),
    );
    return { signals, total };
  }

  /** Unlike `cases`/`incidents`, a signal isn't compartment-gated (compartment is only assigned
   * once it's promoted to an Incident — see `validate` below), so this is a plain tenant-wide
   * `groupBy`, not the access-filtered batch pattern CasesService/IncidentsService use for their
   * own `stats()`. */
  async stats(): Promise<{ total: number; byStatus: Record<SignalStatus, number>; whistleblowerCount: number }> {
    const [byStatusRows, whistleblowerCount, total] = await this.prisma.forCurrentTenant((tx) =>
      Promise.all([
        tx.signal.groupBy({ by: ['status'], _count: { _all: true } }),
        tx.signal.count({ where: { source: SignalSource.WHISTLEBLOWER } }),
        tx.signal.count(),
      ]),
    );
    const byStatus = Object.fromEntries(Object.values(SignalStatus).map((s) => [s, 0])) as Record<SignalStatus, number>;
    for (const row of byStatusRows) byStatus[row.status] = row._count._all;
    return { total, byStatus, whistleblowerCount };
  }

  /** `actor` is optional only because `validate`/`reject` call this internally after their own
   * `TRIAGE_ROLES` gate has already run (they never pass an `INCIDENT_REPORTER` actor in
   * practice) — every controller-facing call site must pass it. `INCIDENT_REPORTER` can only
   * fetch a signal they themselves reported, added 2026-11-24 alongside the same fix to `list()`. */
  async getById(id: string, actor?: AuthenticatedUser): Promise<Signal> {
    const signal = await this.prisma.forCurrentTenant((tx) => tx.signal.findUnique({ where: { id } }));
    if (!signal) {
      throw new NotFoundException('Signal not found');
    }
    if (actor?.role === Role.INCIDENT_REPORTER && signal.reportedBy !== actor.sub) {
      await this.auditService.record({
        tenantId: actor.tenantId,
        actorUserId: actor.sub,
        action: 'incidents.signal.view',
        entityType: 'Signal',
        entityId: id,
        outcome: AuditOutcome.DENIED,
        metadata: { reason: 'not_own_report' },
      });
      throw new ForbiddenException('Not authorized to view this signal');
    }
    return signal;
  }

  /**
   * Promotes a NEW signal into either a brand-new Incident or a corroborating link onto an
   * existing one (`dto.linkToIncidentId`) — the dedupe decision described in the schema.prisma
   * module comment. Delegates the actual Incident row creation to IncidentsService (this
   * service owns Signal, not Incident — see the module boundary rule, CLAUDE.md
   * non-negotiable #2) rather than writing to the incidents table itself.
   */
  async validate(actor: AuthenticatedUser, id: string, dto: ValidateSignalDto): Promise<Signal> {
    const signal = await this.getById(id);
    if (signal.status !== SignalStatus.NEW) {
      throw new BadRequestException(`Signal is already ${signal.status.toLowerCase()} — only a NEW signal can be validated`);
    }

    if (dto.linkToIncidentId) {
      // Merge path: attach this signal as corroboration of an existing incident, not a new
      // one. getById enforces the same compartment visibility a direct read would (see
      // IncidentsService) — an investigator can't merge a signal into an incident they
      // couldn't otherwise see.
      await this.incidentsService.getById(actor, dto.linkToIncidentId);
    } else if (!dto.category || !dto.type || !dto.title || !dto.description) {
      throw new BadRequestException(
        'category, type, title, and description are required when not linking to an existing incident',
      );
    }

    // Incident creation (new-incident path only) and the Signal status update happen inside
    // ONE transaction so a signal can never end up VALIDATED without its Incident existing, or
    // vice versa — mirrors the create()/whistleblower-vault atomicity above.
    const result = await this.prisma.forCurrentTenant(async (tx) => {
      let incidentId: string;
      let resultingStatus: SignalStatus;

      if (dto.linkToIncidentId) {
        incidentId = dto.linkToIncidentId;
        resultingStatus = SignalStatus.MERGED;
      } else {
        const forcedCompartment: Compartment | undefined =
          signal.source === SignalSource.WHISTLEBLOWER ? Compartment.WHISTLEBLOWING : dto.compartment;

        const incident = await this.incidentsService.createFromSignal(tx, actor, {
          category: dto.category!,
          type: dto.type!,
          subtype: dto.subtype,
          title: dto.title!,
          description: dto.description!,
          compartment: forcedCompartment,
          occurredAt: dto.occurredAt,
        });
        incidentId = incident.id;
        resultingStatus = SignalStatus.VALIDATED;
      }

      const updated = await tx.signal.update({
        where: { id },
        data: { status: resultingStatus, incidentId, reviewedBy: actor.sub, reviewedAt: new Date() },
      });

      return { updated, incidentId, resultingStatus };
    });

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'incidents.signal.validate',
      entityType: 'Signal',
      entityId: id,
      outcome: AuditOutcome.SUCCESS,
      metadata: { resultingStatus: result.resultingStatus, incidentId: result.incidentId },
    });

    return result.updated;
  }

  async reject(actor: AuthenticatedUser, id: string, dto: RejectSignalDto): Promise<Signal> {
    const signal = await this.getById(id);
    if (signal.status !== SignalStatus.NEW) {
      throw new BadRequestException(`Signal is already ${signal.status.toLowerCase()} — only a NEW signal can be rejected`);
    }

    const updated = await this.prisma.forCurrentTenant((tx) =>
      tx.signal.update({
        where: { id },
        data: {
          status: SignalStatus.REJECTED,
          rejectedReason: dto.reason,
          reviewedBy: actor.sub,
          reviewedAt: new Date(),
        },
      }),
    );

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'incidents.signal.reject',
      entityType: 'Signal',
      entityId: id,
      outcome: AuditOutcome.SUCCESS,
      metadata: { reason: dto.reason },
    });

    return updated;
  }
}
