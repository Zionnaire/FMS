import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditOutcome, CdKey, Compartment, Incident, IncidentStatus, Prisma } from '@prisma/client';
import { PrismaService, TenantScopedClient } from '../../infrastructure/database/prisma.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user.interface';
import { DEFAULT_PAGE_SIZE } from '../../common/dto/pagination-query.dto';
import { AuditService } from '../audit/audit.service';
import { ConfigurationService } from '../configuration/configuration.service';
import { Cd01IncidentTaxonomy } from '../configuration/types/cd-value.types';
import { UsersService } from '../identity/users.service';
import { MlGatewayService, SimilarIncidentResult } from '../ml-gateway/ml-gateway.service';
import { MergeIncidentDto } from './dto/merge-incident.dto';
import { RelateIncidentsDto } from './dto/relate-incidents.dto';
import { UpdateRiskFactorsDto } from './dto/update-risk-factors.dto';

/** Tenant-wide, compartment-filtered (same visibility rule as `list`/`getById` — never a raw
 * table count) summary for the incidents list page's KPI row. */
export interface IncidentStats {
  total: number;
  byStatus: Record<IncidentStatus, number>;
  restrictedCompartmentCount: number;
  linkedToCaseCount: number;
}

export interface CreateIncidentFromSignalInput {
  category: string;
  type: string;
  subtype?: string;
  title: string;
  description: string;
  compartment?: Compartment;
  occurredAt?: string;
}

/**
 * Owns the `Incident` and `IncidentRelation` tables. There is deliberately no
 * `POST /incidents` route anywhere in this module — `createFromSignal` is the only way an
 * Incident row is created, and it is only ever called by `SignalsService.validate`. This is
 * the Signal -> Incident half of non-negotiable #1: you cannot create an Incident without a
 * Signal that validated into it, enforced by there being no other code path, not just by
 * convention.
 */
@Injectable()
export class IncidentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly configurationService: ConfigurationService,
    private readonly usersService: UsersService,
    private readonly mlGatewayService: MlGatewayService,
  ) {}

  /** CD-08 Phase 2, item two — advisory duplicate/correlation detection. Read-only: finds and
   * scores candidates, never merges/links/rejects anything itself. The candidate set is this
   * actor's own compartment-filtered visible incidents in the same category (via the same
   * `getVisibleIncidents` every other read in this module uses), excluding the target itself and
   * anything already `MERGED`/`REJECTED` — the frontend wires the result to the existing, already-
   * tested `relate`/`merge` actions below. */
  async findSimilarIncidents(actor: AuthenticatedUser, incidentId: string): Promise<SimilarIncidentResult[]> {
    const target = await this.getById(actor, incidentId);

    const visible = await this.getVisibleIncidents(actor);
    const candidates = visible.filter(
      (i) => i.id !== target.id && i.category === target.category && i.status !== IncidentStatus.MERGED && i.status !== IncidentStatus.REJECTED,
    );
    if (candidates.length === 0) return [];

    // Cap the candidate set so a large tenant doesn't send an unbounded prompt — recent first,
    // the same ordering `getVisibleIncidents` already returns.
    const capped = candidates.slice(0, 20);

    const results = await this.mlGatewayService.findSimilarIncidents(
      { id: target.id, referenceCode: target.referenceCode, category: target.category, type: target.type, title: target.title, description: target.description },
      capped.map((c) => ({ id: c.id, referenceCode: c.referenceCode, category: c.category, type: c.type, title: c.title, description: c.description })),
    );

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'incidents.similarity.request',
      entityType: 'Incident',
      entityId: incidentId,
      outcome: AuditOutcome.SUCCESS,
      metadata: { candidateCount: capped.length, matchCount: results.length },
    });

    return results;
  }

  /**
   * Called by SignalsService.validate with ITS OWN open transaction (`tx`), so Incident
   * creation and the triggering Signal's status update commit atomically — this method never
   * opens its own transaction and must not be called outside of one that already exists.
   */
  async createFromSignal(
    tx: TenantScopedClient,
    actor: AuthenticatedUser,
    input: CreateIncidentFromSignalInput,
  ): Promise<Incident> {
    await this.assertValidTaxonomy(input.category, input.type);

    const referenceCode = await this.generateReferenceCode(tx, actor.tenantId);

    try {
      const incident = await tx.incident.create({
        data: {
          tenantId: actor.tenantId,
          referenceCode,
          category: input.category,
          type: input.type,
          subtype: input.subtype,
          title: input.title,
          description: input.description,
          compartment: input.compartment ?? Compartment.STANDARD,
          occurredAt: input.occurredAt ? new Date(input.occurredAt) : undefined,
          createdBy: actor.sub,
        },
      });

      await this.auditService.record({
        tenantId: actor.tenantId,
        actorUserId: actor.sub,
        action: 'incidents.incident.create',
        entityType: 'Incident',
        entityId: incident.id,
        outcome: AuditOutcome.SUCCESS,
        metadata: { referenceCode, category: input.category, type: input.type, compartment: incident.compartment },
      });

      return incident;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Two signals validated into new incidents at the same instant and computed the same
        // reference code — same race/backstop pattern as ConfigurationService.createDraft.
        throw new BadRequestException('Reference code collision — retry validating this signal');
      }
      throw err;
    }
  }

  /** Pagination happens in-memory, over the already compartment-filtered set, not as a SQL
   * LIMIT/OFFSET on the raw query — compartment visibility is itself a filter this method
   * applies after fetching (see `isVisible` below), so paginating before that filter would
   * return pages padded down to fewer than `limit` visible rows. Less DB-efficient than a pure
   * SQL-level page at large row counts; a compartment-aware `WHERE` clause (fetching only rows
   * the actor could ever see, page or not) is the future optimization if this codebase's
   * incident volume ever makes the difference material — not needed at MVP scale. */
  async list(
    actor: AuthenticatedUser,
    status?: IncidentStatus,
    limit = DEFAULT_PAGE_SIZE,
    offset = 0,
    compartment?: Compartment,
    q?: string,
    mine?: boolean,
  ): Promise<{ incidents: Incident[]; total: number }> {
    let visible = await this.getVisibleIncidents(actor, status);
    if (compartment) visible = visible.filter((i) => i.compartment === compartment);
    if (mine) visible = visible.filter((i) => i.createdBy === actor.sub);
    if (q) {
      const needle = q.trim().toLowerCase();
      visible = visible.filter(
        (i) =>
          i.title.toLowerCase().includes(needle) ||
          i.referenceCode.toLowerCase().includes(needle) ||
          i.category.toLowerCase().includes(needle) ||
          i.type.toLowerCase().includes(needle),
      );
    }
    return { incidents: visible.slice(offset, offset + limit), total: visible.length };
  }

  /** Tenant-wide KPI summary for the incidents list page — same compartment-filtered set `list()`
   * computes (never a raw unfiltered count). Deliberately stays within this module's own table
   * (no severity/SLA join against `triage`/`workflow` here — see IncidentsController's own doc
   * comment on why that enrichment doesn't belong in this module). */
  async stats(actor: AuthenticatedUser): Promise<IncidentStats> {
    const visible = await this.getVisibleIncidents(actor);

    const byStatus = Object.fromEntries(Object.values(IncidentStatus).map((s) => [s, 0])) as Record<IncidentStatus, number>;
    let restrictedCompartmentCount = 0;
    let linkedToCaseCount = 0;
    for (const i of visible) {
      byStatus[i.status]++;
      if (i.compartment !== Compartment.STANDARD) restrictedCompartmentCount++;
      if (i.status === IncidentStatus.LINKED_TO_CASE) linkedToCaseCount++;
    }

    return { total: visible.length, byStatus, restrictedCompartmentCount, linkedToCaseCount };
  }

  /** Cross-module read for other modules' own access-filtered queries (e.g. `triage`'s
   * severity-trend chart data) — same `CasesService.getVisibleCaseIds` precedent: callers outside
   * this module reach incident visibility through this method, never by filtering
   * `tx.incident.findMany()` results themselves or (worse) reading another module's own table
   * directly. Returns ids only, not full rows, so callers can't casually depend on unrelated
   * incident fields. */
  async getVisibleIncidentIds(actor: AuthenticatedUser): Promise<string[]> {
    const visible = await this.getVisibleIncidents(actor);
    return visible.map((i) => i.id);
  }

  private async getVisibleIncidents(actor: AuthenticatedUser, status?: IncidentStatus): Promise<Incident[]> {
    const all = await this.prisma.forCurrentTenant((tx) =>
      tx.incident.findMany({ where: status ? { status } : undefined, orderBy: { createdAt: 'desc' } }),
    );
    const grantedCompartments = await this.getGrantedCompartments(actor);
    return all.filter((incident) => this.isVisible(incident.compartment, grantedCompartments));
  }

  /** Throws NotFoundException if the incident doesn't exist in this tenant at all, or
   * ForbiddenException (with an audited denial) if it exists but the actor's compartment
   * grants don't cover it — see the doc comment on `Incident.compartment` in schema.prisma for
   * why this check exists here and not only at the future `cases` level. */
  async getById(actor: AuthenticatedUser, id: string): Promise<Incident> {
    const incident = await this.prisma.forCurrentTenant((tx) => tx.incident.findUnique({ where: { id } }));
    if (!incident) {
      throw new NotFoundException('Incident not found');
    }

    const grantedCompartments = await this.getGrantedCompartments(actor);
    if (!this.isVisible(incident.compartment, grantedCompartments)) {
      await this.auditService.record({
        tenantId: actor.tenantId,
        actorUserId: actor.sub,
        action: 'incidents.incident.view',
        entityType: 'Incident',
        entityId: id,
        outcome: AuditOutcome.DENIED,
        metadata: { compartment: incident.compartment },
      });
      throw new ForbiddenException('Not authorized to view this incident\'s compartment');
    }

    return incident;
  }

  /**
   * The one narrow, single-direction status transition this module allows something outside
   * itself to trigger: OPEN -> UNDER_REVIEW, called by `triage`'s TriageService when it records
   * an incident's first TriageAssessment. This is NOT a general state-machine entry point —
   * architecture.md assigns "state machine" to `workflow`, not `triage` or `incidents`, and
   * building one out ahead of that module existing would be scope creep this codebase has
   * consistently avoided (see e.g. the "no automated dedupe" and "no severity/case-linkage on
   * Incident" notes elsewhere in this module). Idempotent if already UNDER_REVIEW; rejects any
   * other starting status, since triaging a MERGED/REJECTED/CLOSED incident doesn't make sense.
   */
  async markUnderReview(actor: AuthenticatedUser, id: string): Promise<void> {
    const incident = await this.getById(actor, id);
    if (incident.status === IncidentStatus.UNDER_REVIEW) {
      return;
    }
    if (incident.status !== IncidentStatus.OPEN) {
      throw new BadRequestException(
        `Incident is ${incident.status.toLowerCase()} — only an OPEN incident can move to under review`,
      );
    }

    await this.prisma.forCurrentTenant((tx) =>
      tx.incident.update({ where: { id }, data: { status: IncidentStatus.UNDER_REVIEW } }),
    );

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'incidents.incident.mark_under_review',
      entityType: 'Incident',
      entityId: id,
      outcome: AuditOutcome.SUCCESS,
    });
  }

  /** Captures the structured facts the EFIMS AI Service's severity model needs (see
   * schema.prisma's `Incident` doc comment) — a partial update, same `getById` visibility
   * discipline as every other write in this module. Not a status transition and not gated to any
   * narrower role list, same convention `relate`/`merge` already use in this controller (the
   * compartment-visibility check inside `getById` is the one that actually matters). */
  async updateRiskFactors(actor: AuthenticatedUser, id: string, dto: UpdateRiskFactorsDto): Promise<Incident> {
    await this.getById(actor, id);

    const updated = await this.prisma.forCurrentTenant((tx) =>
      tx.incident.update({
        where: { id },
        data: {
          financialExposureNgn: dto.financialExposureNgn,
          customerImpactCount: dto.customerImpactCount,
          ongoingThreat: dto.ongoingThreat,
          insiderInvolvement: dto.insiderInvolvement,
          dataCompromise: dto.dataCompromise,
          regulatoryRelevance: dto.regulatoryRelevance,
          channel: dto.channel,
          reportedByType: dto.reportedByType,
        },
      }),
    );

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'incidents.incident.update_risk_factors',
      entityType: 'Incident',
      entityId: id,
      outcome: AuditOutcome.SUCCESS,
      metadata: dto as unknown as Prisma.InputJsonValue,
    });

    return updated;
  }

  /**
   * The other narrow, module-boundary-respecting transition this module exposes: sets
   * `Incident.caseId` and moves status to `LINKED_TO_CASE` — called only by `cases`'
   * CasesService, never triggered by `incidents` itself (see the doc comment on
   * `Incident.caseId` in schema.prisma). Idempotent if already linked to this exact case;
   * rejects linking to a *different* case (an incident belongs to at most one) or linking a
   * MERGED/REJECTED/CLOSED_NO_CASE incident (those are terminal states a case link doesn't
   * make sense from).
   */
  async linkToCase(actor: AuthenticatedUser, id: string, caseId: string): Promise<void> {
    const incident = await this.getById(actor, id);
    if (incident.status === IncidentStatus.LINKED_TO_CASE) {
      if (incident.caseId === caseId) {
        return;
      }
      throw new BadRequestException('This incident is already linked to a different case');
    }
    if (incident.status !== IncidentStatus.OPEN && incident.status !== IncidentStatus.UNDER_REVIEW) {
      throw new BadRequestException(`Incident is ${incident.status.toLowerCase()} — cannot be linked to a case`);
    }

    await this.prisma.forCurrentTenant((tx) =>
      tx.incident.update({ where: { id }, data: { caseId, status: IncidentStatus.LINKED_TO_CASE } }),
    );

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'incidents.incident.link_to_case',
      entityType: 'Incident',
      entityId: id,
      outcome: AuditOutcome.SUCCESS,
      metadata: { caseId },
    });
  }

  async merge(actor: AuthenticatedUser, id: string, dto: MergeIncidentDto): Promise<Incident> {
    if (id === dto.targetIncidentId) {
      throw new BadRequestException('An incident cannot be merged into itself');
    }
    await this.getById(actor, id);
    await this.getById(actor, dto.targetIncidentId);

    const merged = await this.prisma.forCurrentTenant((tx) =>
      tx.incident.update({
        where: { id },
        data: { status: IncidentStatus.MERGED, mergedIntoIncidentId: dto.targetIncidentId },
      }),
    );

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'incidents.incident.merge',
      entityType: 'Incident',
      entityId: id,
      outcome: AuditOutcome.SUCCESS,
      metadata: { targetIncidentId: dto.targetIncidentId },
    });

    return merged;
  }

  async relate(actor: AuthenticatedUser, id: string, dto: RelateIncidentsDto): Promise<void> {
    if (id === dto.relatedIncidentId) {
      throw new BadRequestException('An incident cannot be related to itself');
    }
    await this.getById(actor, id);
    await this.getById(actor, dto.relatedIncidentId);

    await this.prisma.forCurrentTenant((tx) =>
      tx.incidentRelation.upsert({
        where: { incidentId_relatedIncidentId: { incidentId: id, relatedIncidentId: dto.relatedIncidentId } },
        update: {},
        create: {
          tenantId: actor.tenantId,
          incidentId: id,
          relatedIncidentId: dto.relatedIncidentId,
          linkedBy: actor.sub,
        },
      }),
    );

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'incidents.incident.relate',
      entityType: 'Incident',
      entityId: id,
      outcome: AuditOutcome.SUCCESS,
      metadata: { relatedIncidentId: dto.relatedIncidentId },
    });
  }

  private async getGrantedCompartments(actor: AuthenticatedUser): Promise<Set<Compartment>> {
    const granted = await this.usersService.getGrantedCompartments(actor.sub);
    return new Set(granted);
  }

  /** STANDARD is visible to everyone by default — compartments exist to RESTRICT the other 5,
   * not to gate ordinary business as usual. Everything else requires an explicit grant. */
  private isVisible(compartment: Compartment, granted: Set<Compartment>): boolean {
    return compartment === Compartment.STANDARD || granted.has(compartment);
  }

  /** Validates category+type against the tenant's *current* CD-01 configuration — never a
   * hardcoded list, per configuration-decisions.md's framing that taxonomy is versioned
   * per-tenant config, not code. If CD-01 has no current value at all (shouldn't happen once
   * seeded, but a fresh tenant with no config yet is possible), this fails open with a 400
   * rather than silently accepting anything — an incident with an unvalidated category is
   * worse than a blocked request. */
  private async assertValidTaxonomy(category: string, type: string): Promise<void> {
    const current = await this.configurationService.getCurrent(CdKey.CD_01_INCIDENT_TAXONOMY);
    if (!current) {
      throw new BadRequestException('No CD-01 incident taxonomy is configured for this tenant yet');
    }
    const taxonomy = current.value as unknown as Cd01IncidentTaxonomy;
    const matchedCategory = taxonomy.categories.find((c) => c.name === category);
    if (!matchedCategory) {
      throw new BadRequestException(`Unknown incident category "${category}" — not present in the current CD-01 taxonomy`);
    }
    if (!matchedCategory.types.some((t) => t.name === type)) {
      throw new BadRequestException(`Unknown incident type "${type}" under category "${category}"`);
    }
  }

  /** "INC-{year}-{seq}" per tenant per year, seq computed from the current count + 1 — same
   * race caveat as ConfigurationService.createDraft's version numbering: rare in practice for
   * this kind of write volume, and the (tenantId, referenceCode) unique constraint is the hard
   * backstop against two rows ever landing on the same code (see the P2002 catch above). */
  private async generateReferenceCode(tx: TenantScopedClient, tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `INC-${year}-`;
    const count = await tx.incident.count({ where: { tenantId, referenceCode: { startsWith: prefix } } });
    return `${prefix}${String(count + 1).padStart(4, '0')}`;
  }
}
