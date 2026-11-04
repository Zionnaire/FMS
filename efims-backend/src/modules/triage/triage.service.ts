import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditOutcome, CdKey, TriageAssessment } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user.interface';
import { AuditService } from '../audit/audit.service';
import { ConfigurationService } from '../configuration/configuration.service';
import { Cd03SlaCalendars } from '../configuration/types/cd-value.types';
import { TeamsService } from '../identity/teams.service';
import { IncidentsService } from '../incidents/incidents.service';
import { CreateTriageAssessmentDto } from './dto/create-triage-assessment.dto';

/**
 * Owns `TriageAssessment` — the severity/routing half of architecture.md's "severity engine,
 * routing, escalation" (the third, "escalation", is just this module's `escalate` producing a
 * new assessment that revises a prior one; there's no separate escalation entity). Every read
 * goes through `IncidentsService.getById` first, which is where compartment visibility and
 * existence are actually enforced — this module never queries `incidents` directly, per
 * CLAUDE.md non-negotiable #2.
 */
@Injectable()
export class TriageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly configurationService: ConfigurationService,
    private readonly incidentsService: IncidentsService,
    private readonly teamsService: TeamsService,
  ) {}

  /** The first assessment for an incident. Also moves the incident OPEN -> UNDER_REVIEW (see
   * IncidentsService.markUnderReview's own doc comment for why that's the one status transition
   * this module is allowed to trigger). That call happens in its own transaction, separate from
   * the assessment write — a status lag if one succeeds and the other doesn't is a minor,
   * recoverable staleness, not a structural integrity problem the way an orphaned record would
   * be, so the added complexity of a shared cross-module transaction isn't worth it here. */
  async assess(actor: AuthenticatedUser, incidentId: string, dto: CreateTriageAssessmentDto): Promise<TriageAssessment> {
    await this.incidentsService.getById(actor, incidentId);

    const existing = await this.getCurrentOrNull(incidentId);
    if (existing) {
      throw new BadRequestException('This incident already has a triage assessment — use escalate to revise it');
    }

    const created = await this.createAssessment(actor, incidentId, dto, null);
    await this.incidentsService.markUnderReview(actor, incidentId);
    return created;
  }

  /** Revises a prior assessment — severity, calendar, and/or team can all move in either
   * direction (see the doc comment on TriageAssessment in schema.prisma for why "escalation"
   * doesn't mean severity can only go up). */
  async escalate(actor: AuthenticatedUser, incidentId: string, dto: CreateTriageAssessmentDto): Promise<TriageAssessment> {
    await this.incidentsService.getById(actor, incidentId);

    const current = await this.getCurrentOrNull(incidentId);
    if (!current) {
      throw new BadRequestException('This incident has no prior assessment yet — assess it first');
    }

    return this.createAssessment(actor, incidentId, dto, current.id);
  }

  async getCurrent(actor: AuthenticatedUser, incidentId: string): Promise<TriageAssessment> {
    await this.incidentsService.getById(actor, incidentId);
    const current = await this.getCurrentOrNull(incidentId);
    if (!current) {
      throw new NotFoundException('No triage assessment exists for this incident yet');
    }
    return current;
  }

  async getHistory(actor: AuthenticatedUser, incidentId: string): Promise<TriageAssessment[]> {
    await this.incidentsService.getById(actor, incidentId);
    return this.prisma.forCurrentTenant((tx) =>
      tx.triageAssessment.findMany({ where: { incidentId }, orderBy: { assessedAt: 'desc' } }),
    );
  }

  private async getCurrentOrNull(incidentId: string): Promise<TriageAssessment | null> {
    return this.prisma.forCurrentTenant((tx) =>
      tx.triageAssessment.findFirst({ where: { incidentId }, orderBy: { assessedAt: 'desc' } }),
    );
  }

  private async createAssessment(
    actor: AuthenticatedUser,
    incidentId: string,
    dto: CreateTriageAssessmentDto,
    previousAssessmentId: string | null,
  ): Promise<TriageAssessment> {
    await this.assertValidSlaCalendar(dto.slaCalendarName);
    if (dto.assignedTeamId) {
      await this.teamsService.assertExists(dto.assignedTeamId);
    }

    const created = await this.prisma.forCurrentTenant((tx) =>
      tx.triageAssessment.create({
        data: {
          tenantId: actor.tenantId,
          incidentId,
          severity: dto.severity,
          slaCalendarName: dto.slaCalendarName,
          assignedTeamId: dto.assignedTeamId,
          rationale: dto.rationale,
          previousAssessmentId: previousAssessmentId ?? undefined,
          assessedBy: actor.sub,
        },
      }),
    );

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: previousAssessmentId ? 'triage.assessment.escalate' : 'triage.assessment.create',
      entityType: 'TriageAssessment',
      entityId: created.id,
      outcome: AuditOutcome.SUCCESS,
      metadata: { incidentId, severity: dto.severity, slaCalendarName: dto.slaCalendarName },
    });

    return created;
  }

  /** Validates against the tenant's *current* CD-03 configuration — never a hardcoded list of
   * calendar names, mirroring IncidentsService's own CD-01 taxonomy check. */
  private async assertValidSlaCalendar(name: string): Promise<void> {
    const current = await this.configurationService.getCurrent(CdKey.CD_03_SLA_CALENDARS);
    if (!current) {
      throw new BadRequestException('No CD-03 SLA calendar configuration exists for this tenant yet');
    }
    const config = current.value as unknown as Cd03SlaCalendars;
    if (!config.calendars.some((c) => c.name === name)) {
      throw new BadRequestException(`Unknown SLA calendar "${name}" — not present in the current CD-03 configuration`);
    }
  }
}
