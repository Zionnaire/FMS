import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditOutcome, Finding, Interview, InvestigationIssue, InvestigationPlan, InvestigationPlanStatus, IssueStatus } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user.interface';
import { AuditService } from '../audit/audit.service';
import { CasesService } from '../cases/cases.service';
import { CreateFindingDto } from './dto/create-finding.dto';
import { CreateInterviewDto } from './dto/create-interview.dto';
import { CreateInvestigationPlanDto } from './dto/create-investigation-plan.dto';
import { CreateIssueDto } from './dto/create-issue.dto';
import { ResolveIssueDto } from './dto/resolve-issue.dto';

/**
 * Owns `InvestigationPlan`/`InvestigationIssue`/`Interview`/`Finding` — architecture.md's
 * "plans, issues, interviews, findings". Every method calls `casesService.getById(actor,
 * caseId)` first — the full 7-condition access check, not duplicated here — before touching
 * anything, the same "check access via the owning module's service, not a copy of its logic"
 * discipline every other module in this codebase already follows.
 */
@Injectable()
export class InvestigationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly casesService: CasesService,
  ) {}

  async createPlan(actor: AuthenticatedUser, caseId: string, dto: CreateInvestigationPlanDto): Promise<InvestigationPlan> {
    await this.casesService.getById(actor, caseId);

    const created = await this.prisma.forCurrentTenant(async (tx) => {
      const latest = await tx.investigationPlan.findFirst({
        where: { caseId },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      return tx.investigationPlan.create({
        data: {
          tenantId: actor.tenantId,
          caseId,
          version: (latest?.version ?? 0) + 1,
          objectives: dto.objectives,
          scope: dto.scope,
          status: dto.status ?? InvestigationPlanStatus.DRAFT,
          createdBy: actor.sub,
        },
      });
    });

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'investigations.plan.create',
      entityType: 'InvestigationPlan',
      entityId: created.id,
      outcome: AuditOutcome.SUCCESS,
      metadata: { caseId, version: created.version, status: created.status },
    });

    return created;
  }

  async getCurrentPlan(actor: AuthenticatedUser, caseId: string): Promise<InvestigationPlan> {
    await this.casesService.getById(actor, caseId);
    const plan = await this.prisma.forCurrentTenant((tx) =>
      tx.investigationPlan.findFirst({ where: { caseId }, orderBy: { version: 'desc' } }),
    );
    if (!plan) {
      throw new NotFoundException('No investigation plan exists for this case yet');
    }
    return plan;
  }

  async listPlans(actor: AuthenticatedUser, caseId: string): Promise<InvestigationPlan[]> {
    await this.casesService.getById(actor, caseId);
    return this.prisma.forCurrentTenant((tx) =>
      tx.investigationPlan.findMany({ where: { caseId }, orderBy: { version: 'desc' } }),
    );
  }

  async raiseIssue(actor: AuthenticatedUser, caseId: string, dto: CreateIssueDto): Promise<InvestigationIssue> {
    await this.casesService.getById(actor, caseId);

    const created = await this.prisma.forCurrentTenant((tx) =>
      tx.investigationIssue.create({
        data: { tenantId: actor.tenantId, caseId, title: dto.title, description: dto.description, raisedBy: actor.sub },
      }),
    );

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'investigations.issue.raise',
      entityType: 'InvestigationIssue',
      entityId: created.id,
      outcome: AuditOutcome.SUCCESS,
      metadata: { caseId },
    });

    return created;
  }

  async listIssues(actor: AuthenticatedUser, caseId: string, status?: IssueStatus): Promise<InvestigationIssue[]> {
    await this.casesService.getById(actor, caseId);
    return this.prisma.forCurrentTenant((tx) =>
      tx.investigationIssue.findMany({ where: { caseId, status }, orderBy: { raisedAt: 'desc' } }),
    );
  }

  async resolveIssue(actor: AuthenticatedUser, caseId: string, issueId: string, dto: ResolveIssueDto): Promise<InvestigationIssue> {
    await this.casesService.getById(actor, caseId);

    const issue = await this.prisma.forCurrentTenant((tx) => tx.investigationIssue.findUnique({ where: { id: issueId } }));
    if (!issue || issue.caseId !== caseId) {
      throw new NotFoundException('Issue not found on this case');
    }
    if (issue.status === IssueStatus.RESOLVED) {
      throw new BadRequestException('This issue is already resolved');
    }

    const updated = await this.prisma.forCurrentTenant((tx) =>
      tx.investigationIssue.update({
        where: { id: issueId },
        data: { status: IssueStatus.RESOLVED, resolution: dto.resolution, resolvedBy: actor.sub, resolvedAt: new Date() },
      }),
    );

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'investigations.issue.resolve',
      entityType: 'InvestigationIssue',
      entityId: issueId,
      outcome: AuditOutcome.SUCCESS,
      metadata: { caseId },
    });

    return updated;
  }

  async recordInterview(actor: AuthenticatedUser, caseId: string, dto: CreateInterviewDto): Promise<Interview> {
    await this.casesService.getById(actor, caseId);

    const created = await this.prisma.forCurrentTenant((tx) =>
      tx.interview.create({
        data: {
          tenantId: actor.tenantId,
          caseId,
          intervieweeName: dto.intervieweeName,
          intervieweeRole: dto.intervieweeRole,
          intervieweeUserId: dto.intervieweeUserId,
          conductedBy: actor.sub,
          conductedAt: new Date(dto.conductedAt),
          summary: dto.summary,
          notes: dto.notes,
        },
      }),
    );

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'investigations.interview.record',
      entityType: 'Interview',
      entityId: created.id,
      outcome: AuditOutcome.SUCCESS,
      metadata: { caseId, intervieweeRole: dto.intervieweeRole },
    });

    return created;
  }

  async listInterviews(actor: AuthenticatedUser, caseId: string): Promise<Interview[]> {
    await this.casesService.getById(actor, caseId);
    return this.prisma.forCurrentTenant((tx) => tx.interview.findMany({ where: { caseId }, orderBy: { conductedAt: 'desc' } }));
  }

  async recordFinding(actor: AuthenticatedUser, caseId: string, dto: CreateFindingDto): Promise<Finding> {
    await this.casesService.getById(actor, caseId);

    if (dto.resolvesIssueId) {
      const issue = await this.prisma.forCurrentTenant((tx) => tx.investigationIssue.findUnique({ where: { id: dto.resolvesIssueId } }));
      if (!issue || issue.caseId !== caseId) {
        throw new BadRequestException('resolvesIssueId does not reference an issue on this case');
      }
    }

    const created = await this.prisma.forCurrentTenant((tx) =>
      tx.finding.create({
        data: {
          tenantId: actor.tenantId,
          caseId,
          title: dto.title,
          description: dto.description,
          supportingEvidence: dto.supportingEvidence,
          resolvesIssueId: dto.resolvesIssueId,
          createdBy: actor.sub,
        },
      }),
    );

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'investigations.finding.record',
      entityType: 'Finding',
      entityId: created.id,
      outcome: AuditOutcome.SUCCESS,
      metadata: { caseId, resolvesIssueId: dto.resolvesIssueId },
    });

    return created;
  }

  async listFindings(actor: AuthenticatedUser, caseId: string): Promise<Finding[]> {
    await this.casesService.getById(actor, caseId);
    return this.prisma.forCurrentTenant((tx) => tx.finding.findMany({ where: { caseId }, orderBy: { createdAt: 'desc' } }));
  }

  /** General cross-case register for the top-level "Investigations" nav page — one row per case
   * that has a plan (not every plan version), showing its latest plan plus how many issues are
   * still open. Aggregated, like `RecoveryService.listAll`/`queue`, rather than a flat per-entity
   * list like `EvidenceService.listAll`: a plan is versioned, so "the case's investigation state"
   * is its latest version, not a row per version. */
  async listAll(actor: AuthenticatedUser): Promise<
    {
      caseId: string;
      referenceCode: string;
      caseTitle: string;
      planStatus: InvestigationPlanStatus;
      objectives: string;
      openIssueCount: number;
      lastActivityAt: Date;
    }[]
  > {
    const visibleCaseIds = await this.casesService.getVisibleCaseIds(actor);
    if (visibleCaseIds.length === 0) return [];

    const [latestPlans, openIssueCounts, caseById] = await this.prisma.forCurrentTenant((tx) =>
      Promise.all([
        tx.investigationPlan.findMany({
          where: { caseId: { in: visibleCaseIds } },
          orderBy: [{ caseId: 'asc' }, { version: 'desc' }],
          distinct: ['caseId'],
        }),
        tx.investigationIssue.groupBy({
          by: ['caseId'],
          where: { caseId: { in: visibleCaseIds }, status: { not: IssueStatus.RESOLVED } },
          _count: { _all: true },
        }),
        this.casesService.getCaseSummariesByIds(visibleCaseIds, tx),
      ]),
    );

    const openIssueCountByCaseId = new Map(openIssueCounts.map((o) => [o.caseId, o._count._all]));

    return latestPlans
      .filter((p) => caseById.has(p.caseId))
      .map((p) => {
        const caseInfo = caseById.get(p.caseId)!;
        return {
          caseId: p.caseId,
          referenceCode: caseInfo.referenceCode,
          caseTitle: caseInfo.title,
          planStatus: p.status,
          objectives: p.objectives,
          openIssueCount: openIssueCountByCaseId.get(p.caseId) ?? 0,
          lastActivityAt: p.createdAt,
        };
      })
      .sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime());
  }
}
