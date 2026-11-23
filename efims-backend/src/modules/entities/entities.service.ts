import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditOutcome, Entity, EntityIdentifier, EntityRelationship, EntityRiskAssessment } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user.interface';
import { AuditService } from '../audit/audit.service';
import { CasesService } from '../cases/cases.service';
import { AddIdentifierDto } from './dto/add-identifier.dto';
import { AddRelationshipDto } from './dto/add-relationship.dto';
import { CreateEntityDto, UpdateEntityDto } from './dto/create-entity.dto';
import { LinkCaseDto } from './dto/link-case.dto';
import { RecordRiskAssessmentDto } from './dto/record-risk-assessment.dto';
import { SetWatchlistDto } from './dto/set-watchlist.dto';

const MAX_GRAPH_DEPTH = 4;

export interface VisibleCaseLink {
  caseId: string;
  referenceCode: string;
  title: string;
  role: string;
  linkedAt: Date;
}

export interface EntityDetail extends Entity {
  identifiers: EntityIdentifier[];
  relationships: EntityRelationship[];
  riskAssessments: EntityRiskAssessment[];
  /** Case links the REQUESTING actor can actually see — a case outside their access (wrong
   * compartment, wrong team/clearance, or a compartment like WHISTLEBLOWING they hold no grant
   * for) is omitted entirely, never shown redacted or even counted. See this service's own doc
   * comment on `filterVisibleCaseLinks` for why a redacted placeholder is itself a leak. */
  caseLinks: VisibleCaseLink[];
}

export interface GraphNode {
  id: string;
  type: string;
  displayName: string;
  watchlisted: boolean;
  depth: number;
  visibleCaseCount: number;
}

export interface GraphEdge {
  id: string;
  fromEntityId: string;
  toEntityId: string;
  relationshipType: string;
}

/**
 * Owns `Entity`/`EntityIdentifier`/`EntityRelationship`/`EntityCaseLink`/`EntityRiskAssessment` —
 * the "Parties/Transactions" area `cases`' own schema.prisma doc comment names as deliberately
 * out of scope until now. An `Entity` is tenant-wide, not case-scoped, so (unlike `recovery`/
 * `evidence`/every other case-nested module) there is no `CasesService.getById` call gating
 * ordinary entity reads/writes — every route is instead gated at the role level
 * (`EXCEPT_REPORTER_ROLES`, the same non-case-scoped-investigative-tool precedent
 * `MlGatewayController`'s transaction-risk-scoring route already set). `CasesService` IS called,
 * directly and deliberately, the moment an entity touches a specific case: `linkCase` requires the
 * actor to already pass `getById` for that case before the link can be created, and every method
 * that reads case links back out filters them through `getVisibleCaseIds` first. Non-negotiable
 * #2: this module never reads `cases`/`case_user_flags` tables directly, only through
 * `CasesService`'s public interface.
 */
@Injectable()
export class EntitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly casesService: CasesService,
  ) {}

  async create(actor: AuthenticatedUser, dto: CreateEntityDto): Promise<Entity> {
    const created = await this.prisma.forCurrentTenant((tx) =>
      tx.entity.create({
        data: { tenantId: actor.tenantId, type: dto.type, displayName: dto.displayName, createdBy: actor.sub },
      }),
    );

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'entities.entity.create',
      entityType: 'Entity',
      entityId: created.id,
      outcome: AuditOutcome.SUCCESS,
      metadata: { type: dto.type, displayName: dto.displayName },
    });

    return created;
  }

  async list(actor: AuthenticatedUser, filters: { type?: string; watchlisted?: boolean; search?: string }): Promise<Entity[]> {
    return this.prisma.forCurrentTenant((tx) =>
      tx.entity.findMany({
        where: {
          type: filters.type as never,
          watchlisted: filters.watchlisted,
          displayName: filters.search ? { contains: filters.search, mode: 'insensitive' } : undefined,
        },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  async getById(actor: AuthenticatedUser, id: string): Promise<EntityDetail> {
    const entity = await this.findOrThrow(id);

    const [identifiers, relationships, riskAssessments, caseLinks] = await this.prisma.forCurrentTenant((tx) =>
      Promise.all([
        tx.entityIdentifier.findMany({ where: { entityId: id }, orderBy: { createdAt: 'desc' } }),
        tx.entityRelationship.findMany({ where: { OR: [{ fromEntityId: id }, { toEntityId: id }] }, orderBy: { createdAt: 'desc' } }),
        tx.entityRiskAssessment.findMany({ where: { entityId: id }, orderBy: { assessedAt: 'desc' } }),
        tx.entityCaseLink.findMany({ where: { entityId: id }, orderBy: { linkedAt: 'desc' } }),
      ]),
    );

    const visibleCaseLinks = await this.filterVisibleCaseLinks(actor, caseLinks);

    return { ...entity, identifiers, relationships, riskAssessments, caseLinks: visibleCaseLinks };
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdateEntityDto): Promise<Entity> {
    await this.findOrThrow(id);

    const updated = await this.prisma.forCurrentTenant((tx) =>
      tx.entity.update({ where: { id }, data: { displayName: dto.displayName } }),
    );

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'entities.entity.update',
      entityType: 'Entity',
      entityId: id,
      outcome: AuditOutcome.SUCCESS,
      metadata: { displayName: dto.displayName },
    });

    return updated;
  }

  /** Unlike `Case`/`Incident`, an `Entity` can be hard-deleted — see schema.prisma's own doc
   * comment on `Entity` for why (a speculative/duplicate party is a correctable mistake, not a
   * permanent record). Cascades to its identifiers/relationships/case-links/risk-assessments at
   * the DB level (`onDelete: Cascade` on each child relation) — the audit event below still
   * permanently records that the deletion happened, even though the row itself is gone. */
  async delete(actor: AuthenticatedUser, id: string): Promise<void> {
    await this.findOrThrow(id);

    await this.prisma.forCurrentTenant((tx) => tx.entity.delete({ where: { id } }));

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'entities.entity.delete',
      entityType: 'Entity',
      entityId: id,
      outcome: AuditOutcome.SUCCESS,
    });
  }

  async addIdentifier(actor: AuthenticatedUser, entityId: string, dto: AddIdentifierDto): Promise<EntityIdentifier> {
    await this.findOrThrow(entityId);

    const created = await this.prisma.forCurrentTenant((tx) =>
      tx.entityIdentifier.create({
        data: { tenantId: actor.tenantId, entityId, type: dto.type, value: dto.value, createdBy: actor.sub },
      }),
    );

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'entities.identifier.add',
      entityType: 'EntityIdentifier',
      entityId: created.id,
      outcome: AuditOutcome.SUCCESS,
      metadata: { entityId, type: dto.type },
    });

    return created;
  }

  async addRelationship(actor: AuthenticatedUser, entityId: string, dto: AddRelationshipDto): Promise<EntityRelationship> {
    await this.findOrThrow(entityId);
    if (dto.toEntityId === entityId) {
      throw new BadRequestException('An entity cannot have a relationship with itself');
    }
    await this.findOrThrow(dto.toEntityId);

    const created = await this.prisma.forCurrentTenant((tx) =>
      tx.entityRelationship.create({
        data: {
          tenantId: actor.tenantId,
          fromEntityId: entityId,
          toEntityId: dto.toEntityId,
          relationshipType: dto.relationshipType,
          rationale: dto.rationale,
          createdBy: actor.sub,
        },
      }),
    );

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'entities.relationship.add',
      entityType: 'EntityRelationship',
      entityId: created.id,
      outcome: AuditOutcome.SUCCESS,
      metadata: { fromEntityId: entityId, toEntityId: dto.toEntityId, relationshipType: dto.relationshipType },
    });

    return created;
  }

  async removeRelationship(actor: AuthenticatedUser, entityId: string, relationshipId: string): Promise<void> {
    await this.findOrThrow(entityId);

    const relationship = await this.prisma.forCurrentTenant((tx) => tx.entityRelationship.findUnique({ where: { id: relationshipId } }));
    if (!relationship || (relationship.fromEntityId !== entityId && relationship.toEntityId !== entityId)) {
      throw new NotFoundException('Relationship not found for this entity');
    }

    await this.prisma.forCurrentTenant((tx) => tx.entityRelationship.delete({ where: { id: relationshipId } }));

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'entities.relationship.remove',
      entityType: 'EntityRelationship',
      entityId: relationshipId,
      outcome: AuditOutcome.SUCCESS,
      metadata: { entityId },
    });
  }

  /** Requires the actor to already pass `CasesService.getById` for `dto.caseId` — never possible
   * to link an entity to a case you can't otherwise open. This is the ONLY write in this service
   * that calls into `cases`, exactly where non-negotiable #2 says cross-module access belongs. */
  async linkCase(actor: AuthenticatedUser, entityId: string, dto: LinkCaseDto) {
    await this.findOrThrow(entityId);
    await this.casesService.getById(actor, dto.caseId);

    const existing = await this.prisma.forCurrentTenant((tx) =>
      tx.entityCaseLink.findUnique({ where: { entityId_caseId: { entityId, caseId: dto.caseId } } }),
    );
    if (existing) {
      throw new BadRequestException('This entity is already linked to this case');
    }

    const created = await this.prisma.forCurrentTenant((tx) =>
      tx.entityCaseLink.create({
        data: { tenantId: actor.tenantId, entityId, caseId: dto.caseId, role: dto.role, linkedBy: actor.sub },
      }),
    );

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'entities.case_link.create',
      entityType: 'EntityCaseLink',
      entityId: created.id,
      outcome: AuditOutcome.SUCCESS,
      metadata: { entityId, caseId: dto.caseId, role: dto.role },
    });

    return created;
  }

  async unlinkCase(actor: AuthenticatedUser, entityId: string, caseId: string): Promise<void> {
    await this.findOrThrow(entityId);
    await this.casesService.getById(actor, caseId);

    const link = await this.prisma.forCurrentTenant((tx) => tx.entityCaseLink.findUnique({ where: { entityId_caseId: { entityId, caseId } } }));
    if (!link) {
      throw new NotFoundException('This entity is not linked to this case');
    }

    await this.prisma.forCurrentTenant((tx) => tx.entityCaseLink.delete({ where: { id: link.id } }));

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'entities.case_link.remove',
      entityType: 'EntityCaseLink',
      entityId: link.id,
      outcome: AuditOutcome.SUCCESS,
      metadata: { entityId, caseId },
    });
  }

  /** Append-only, chains to the entity's current latest assessment — same "find latest by
   * assessedAt, chain previousAssessmentId" shape as `TriageService`'s own assessment write. */
  async recordRiskAssessment(actor: AuthenticatedUser, entityId: string, dto: RecordRiskAssessmentDto): Promise<EntityRiskAssessment> {
    await this.findOrThrow(entityId);

    const previous = await this.prisma.forCurrentTenant((tx) =>
      tx.entityRiskAssessment.findFirst({ where: { entityId }, orderBy: { assessedAt: 'desc' } }),
    );

    const created = await this.prisma.forCurrentTenant((tx) =>
      tx.entityRiskAssessment.create({
        data: {
          tenantId: actor.tenantId,
          entityId,
          band: dto.band,
          factors: dto.factors as never,
          previousAssessmentId: previous?.id,
          assessedBy: actor.sub,
        },
      }),
    );

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'entities.risk_assessment.record',
      entityType: 'EntityRiskAssessment',
      entityId: created.id,
      outcome: AuditOutcome.SUCCESS,
      metadata: { entityId, band: dto.band, factorCount: dto.factors.length },
    });

    return created;
  }

  async listRiskAssessments(actor: AuthenticatedUser, entityId: string): Promise<EntityRiskAssessment[]> {
    await this.findOrThrow(entityId);
    return this.prisma.forCurrentTenant((tx) => tx.entityRiskAssessment.findMany({ where: { entityId }, orderBy: { assessedAt: 'desc' } }));
  }

  /** The honest substitute for the mockup's fabricated live OFAC/UN/EU/NFIU/Interpol sync — a
   * manual, audited, reason-required flag. `reason` is already validated non-empty by
   * `SetWatchlistDto` whenever `watchlisted` is true. */
  async setWatchlist(actor: AuthenticatedUser, entityId: string, dto: SetWatchlistDto): Promise<Entity> {
    await this.findOrThrow(entityId);

    const updated = await this.prisma.forCurrentTenant((tx) =>
      tx.entity.update({
        where: { id: entityId },
        data: { watchlisted: dto.watchlisted, watchlistReason: dto.watchlisted ? dto.reason : null },
      }),
    );

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'entities.watchlist.set',
      entityType: 'Entity',
      entityId,
      outcome: AuditOutcome.SUCCESS,
      metadata: { watchlisted: dto.watchlisted, reason: dto.reason },
    });

    return updated;
  }

  /** Bounded-depth recursive traversal over `EntityRelationship` — the plain-Postgres fallback
   * architecture.md §6 names explicitly for this ("Postgres recursive queries cover basic lookups
   * until [Neo4j's trigger condition is met]"). Depth capped at `MAX_GRAPH_DEPTH`, matching the
   * mockup's own 1-4 hop-depth selector. Each returned node's `visibleCaseCount` is computed
   * through the same access-filtering as `getById` — never a raw count of every case link, which
   * would itself leak that a hidden-compartment case exists. */
  async getGraph(actor: AuthenticatedUser, entityId: string, depth: number): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
    await this.findOrThrow(entityId);
    const boundedDepth = Math.min(Math.max(depth, 1), MAX_GRAPH_DEPTH);

    const edgeRows = await this.prisma.forCurrentTenant(
      (tx) => tx.$queryRaw<{ id: string; fromEntityId: string; toEntityId: string; relationshipType: string; depth: number }[]>`
        WITH RECURSIVE graph AS (
          SELECT id, "fromEntityId", "toEntityId", "relationshipType", 1 AS depth
          FROM entity_relationships
          WHERE "tenantId" = ${actor.tenantId} AND ("fromEntityId" = ${entityId} OR "toEntityId" = ${entityId})
          UNION
          SELECT er.id, er."fromEntityId", er."toEntityId", er."relationshipType", g.depth + 1
          FROM entity_relationships er
          INNER JOIN graph g
            ON er."tenantId" = ${actor.tenantId}
            AND (er."fromEntityId" IN (g."fromEntityId", g."toEntityId") OR er."toEntityId" IN (g."fromEntityId", g."toEntityId"))
          WHERE g.depth < ${boundedDepth}
        )
        SELECT DISTINCT id, "fromEntityId", "toEntityId", "relationshipType", MIN(depth) OVER (PARTITION BY id) AS depth
        FROM graph
      `,
    );

    const nodeIds = new Set<string>([entityId]);
    for (const edge of edgeRows) {
      nodeIds.add(edge.fromEntityId);
      nodeIds.add(edge.toEntityId);
    }

    const [entities, allCaseLinks] = await this.prisma.forCurrentTenant((tx) =>
      Promise.all([
        tx.entity.findMany({ where: { id: { in: [...nodeIds] } } }),
        tx.entityCaseLink.findMany({ where: { entityId: { in: [...nodeIds] } } }),
      ]),
    );

    const visibleCaseIds = new Set(await this.casesService.getVisibleCaseIds(actor));
    const visibleCaseCountByEntity = new Map<string, number>();
    for (const link of allCaseLinks) {
      if (visibleCaseIds.has(link.caseId)) {
        visibleCaseCountByEntity.set(link.entityId, (visibleCaseCountByEntity.get(link.entityId) ?? 0) + 1);
      }
    }

    const depthByEntity = new Map<string, number>([[entityId, 0]]);
    for (const edge of edgeRows) {
      const neighborDepth = edge.depth;
      if (!depthByEntity.has(edge.fromEntityId) || depthByEntity.get(edge.fromEntityId)! > neighborDepth) {
        depthByEntity.set(edge.fromEntityId, neighborDepth);
      }
      if (!depthByEntity.has(edge.toEntityId) || depthByEntity.get(edge.toEntityId)! > neighborDepth) {
        depthByEntity.set(edge.toEntityId, neighborDepth);
      }
    }

    const nodes: GraphNode[] = entities.map((e) => ({
      id: e.id,
      type: e.type,
      displayName: e.displayName,
      watchlisted: e.watchlisted,
      depth: depthByEntity.get(e.id) ?? 0,
      visibleCaseCount: visibleCaseCountByEntity.get(e.id) ?? 0,
    }));

    const edges: GraphEdge[] = edgeRows.map((e) => ({
      id: e.id,
      fromEntityId: e.fromEntityId,
      toEntityId: e.toEntityId,
      relationshipType: e.relationshipType,
    }));

    return { nodes, edges };
  }

  /** The critical access-control step every case-link read goes through. A case outside
   * `STANDARD` compartment the actor isn't granted, or one they fail on team/clearance grounds,
   * is dropped from the result entirely — not shown as a redacted placeholder or even counted.
   * For a compartment like `WHISTLEBLOWING`, even a "1 hidden case" count would let a viewer infer
   * that this entity touches a whistleblowing case, which is itself the kind of indirect exposure
   * non-negotiable #7's separate reporter-identity vault exists to prevent. Reuses
   * `CasesService.getVisibleCaseIds`/`getCaseSummariesByIds` — the exact same 5-condition check
   * every other list/queue view in this codebase is filtered through, no new access model. */
  private async filterVisibleCaseLinks(
    actor: AuthenticatedUser,
    links: { caseId: string; role: string; linkedAt: Date }[],
  ): Promise<VisibleCaseLink[]> {
    if (links.length === 0) return [];

    const visibleCaseIds = new Set(await this.casesService.getVisibleCaseIds(actor));
    const visibleLinks = links.filter((l) => visibleCaseIds.has(l.caseId));
    if (visibleLinks.length === 0) return [];

    const summaries = await this.casesService.getCaseSummariesByIds(visibleLinks.map((l) => l.caseId));

    return visibleLinks
      .filter((l) => summaries.has(l.caseId))
      .map((l) => ({ caseId: l.caseId, ...summaries.get(l.caseId)!, role: l.role, linkedAt: l.linkedAt }));
  }

  private async findOrThrow(id: string): Promise<Entity> {
    const entity = await this.prisma.forCurrentTenant((tx) => tx.entity.findUnique({ where: { id } }));
    if (!entity) {
      throw new NotFoundException('Entity not found');
    }
    return entity;
  }
}
