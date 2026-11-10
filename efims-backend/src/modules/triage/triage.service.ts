import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditOutcome, CdKey, TriageAssessment } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user.interface';
import { AuditService } from '../audit/audit.service';
import { ConfigurationService } from '../configuration/configuration.service';
import { Cd03SlaCalendars } from '../configuration/types/cd-value.types';
import { TeamsService } from '../identity/teams.service';
import { IncidentsService } from '../incidents/incidents.service';
import { MlGatewayService, SeveritySuggestion } from '../ml-gateway/ml-gateway.service';
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
    private readonly mlGatewayService: MlGatewayService,
  ) {}

  /** CD-08 Phase 2, item one — advisory-only severity suggestion. Read-only: never writes a
   * `TriageAssessment`, never affects `assess`/`escalate` in any way. The human still calls
   * those with their own chosen severity exactly as before; this is a suggestion shown alongside
   * their own form, not a prefill. Same `IncidentsService.getById` visibility check every other
   * read in this module already goes through. */
  async suggestSeverity(actor: AuthenticatedUser, incidentId: string): Promise<SeveritySuggestion> {
    const incident = await this.incidentsService.getById(actor, incidentId);
    const suggestion = await this.mlGatewayService.suggestSeverity({
      category: incident.category,
      type: incident.type,
      title: incident.title,
      description: incident.description,
    });

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'triage.severity_suggestion.request',
      entityType: 'Incident',
      entityId: incidentId,
      outcome: AuditOutcome.SUCCESS,
      metadata: { suggestedSeverity: suggestion.suggestedSeverity, confidence: suggestion.confidence },
    });

    return suggestion;
  }

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

  /** Daily severity-tier trend for the Executive dashboard's new chart (added 2026-11-10
   * alongside the frontend's first charting library) — reuses `IncidentsService.getVisibleIncidentIds`
   * for the same compartment-filtered visibility every other read in this module gets via
   * `getById`, so the trend never includes an assessment on an incident this actor can't
   * otherwise see. This module owns `TriageAssessment`, so the actual query stays here rather
   * than in `incidents` (same non-negotiable #2 reasoning as every other cross-module call in
   * this file — this is the one place that's allowed to query this table directly). */
  async severityTrend(actor: AuthenticatedUser, days: number): Promise<{ date: string; S1: number; S2: number; S3: number; S4: number }[]> {
    const visibleIds = await this.incidentsService.getVisibleIncidentIds(actor);
    if (visibleIds.length === 0) return [];

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const assessments = await this.prisma.forCurrentTenant((tx) =>
      tx.triageAssessment.findMany({
        where: { incidentId: { in: visibleIds }, assessedAt: { gte: since } },
        select: { severity: true, assessedAt: true },
      }),
    );

    const byDay = new Map<string, { S1: number; S2: number; S3: number; S4: number }>();
    for (const a of assessments) {
      const key = a.assessedAt.toISOString().slice(0, 10);
      const entry = byDay.get(key) ?? { S1: 0, S2: 0, S3: 0, S4: 0 };
      entry[a.severity]++;
      byDay.set(key, entry);
    }

    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, counts]) => ({ date, ...counts }));
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
