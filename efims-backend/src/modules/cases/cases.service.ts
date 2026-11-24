import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ApprovalAction, AuditOutcome, Case, CaseStatus, CaseStatusHistory, CaseUserFlag, CaseUserRelationType, Compartment, Prisma, SeverityTier, Team } from '@prisma/client';
import { PrismaService, TenantScopedClient } from '../../infrastructure/database/prisma.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user.interface';
import { DEFAULT_PAGE_SIZE } from '../../common/dto/pagination-query.dto';
import { CASE_ESCALATED_EVENT, CASE_STATUS_CHANGED_EVENT, CaseEscalatedEvent, CaseStatusChangedEvent } from '../../common/events/domain-events';
import { ELEVATED_ROLES } from '../../common/constants/roles';
import { AuditService } from '../audit/audit.service';
import { TeamsService } from '../identity/teams.service';
import { UsersService } from '../identity/users.service';
import { IncidentsService } from '../incidents/incidents.service';
import { SlaClockService } from '../workflow/sla-clock.service';
import { TriageService } from '../triage/triage.service';
import { ApprovalService } from '../workflow/approval.service';
import { getLossRecoveryTotals } from '../recovery/recovery-ledger.util';
import { AddCaseUserFlagDto } from './dto/add-case-user-flag.dto';
import { AssignCaseTeamDto } from './dto/assign-case-team.dto';
import { BulkAssignCasesDto } from './dto/bulk-assign-cases.dto';
import { BulkEscalateCasesDto } from './dto/bulk-escalate-cases.dto';
import { CreateCaseDto } from './dto/create-case.dto';
import { LinkIncidentDto } from './dto/link-incident.dto';
import { UpdateCaseStatusDto } from './dto/update-case-status.dto';

const SEVERITY_RANK: Record<SeverityTier, number> = { S1: 4, S2: 3, S3: 2, S4: 1 };

/** `ELEVATED_ROLES` now lives in `common/constants/roles.ts` — see that file's own doc comment.
 * Bypasses architecture.md §4.3's team-match condition — cross-cutting oversight functions that
 * legitimately need to see cases outside their own team, as opposed to
 * INVESTIGATOR/TEAM_LEAD/CASE_OWNER, who need actual `TeamMembership` on the case's assigned
 * team. Not stated explicitly in architecture.md (which just says "or elevated role" without
 * naming one) — this mapping is a flagged scope decision, same as ConfigurationController's
 * CD-owner-to-Role mapping caveat. */

/** `list()`'s row shape — the bare `Case` plus two cheap joins (`_count`/`assignedTeam.name`)
 * the cases list page needs to render without an N+1 per row. `getById` still returns a bare
 * `Case`; the detail page already has its own team/incident lookups where it needs them. */
export type CaseListItem = Case & {
  linkedIncidentsCount: number;
  assignedTeamName: string | null;
  /** Not a `Case`-owned field — the highest severity among this case's linked incidents' latest
   * `TriageAssessment`, via `TriageService.getLatestSeverityByIncidentIds` (non-negotiable #2:
   * this module never queries `triage_assessments` directly). `null` if no linked incident has
   * been assessed yet. */
  effectiveSeverity: SeverityTier | null;
  /** Not a `Case`-owned field — true if any linked incident's `SlaClock` is currently breached,
   * via `SlaClockService.getBreachedIncidentIds` (same non-negotiable #2 reasoning — this module
   * never queries `sla_clocks` directly). There is no case-level SLA clock, only one per
   * incident. */
  isOverdue: boolean;
};

/** Tenant-wide, access-filtered (same 7-condition rule as `list`/`getById` — never a raw table
 * count) summary for the cases list page's KPI row. All amounts are NGN — see RecoveryService's
 * own doc comment on why that's this codebase's one currency precedent, not an assumption made
 * fresh here. */
export interface CaseStats {
  total: number;
  byStatus: Record<CaseStatus, number>;
  /** Computed over the full visible set, not just the current page — see `computeSeverityAndOverdue`'s
   * own doc comment on why this is explicitly scoped to this codebase's current seed-data scale,
   * not optimized for bank-scale case volume. */
  bySeverity: Record<SeverityTier, number>;
  overdueCount: number;
  highSensitivityCount: number;
  pendingApprovals: number;
  totalLoss: string;
  totalRecovered: string;
  outstanding: string;
  currency: 'NGN';
  /** Mean `closedAt - createdAt` in days, over this visible set's `CLOSED` cases only — `null`
   * if none are closed yet, rather than `0` (a real "no data" case, not "zero days to close"). */
  meanDaysToClose: number | null;
}

export interface TeamConflictCheckResult {
  teamId: string;
  memberCount: number;
  conflictedMembers: {
    userId: string;
    fullName: string;
    flagType: CaseUserRelationType;
    reason: string | null;
  }[];
}

/**
 * Owns `Case`, `CaseUserFlag`, `CaseStatusHistory` — architecture.md's "case record, team,
 * status history". This is the module CLAUDE.md non-negotiable #6 is actually about: every read
 * of a specific case runs the full 7-condition check from architecture.md §4.3 (tenant, role,
 * team, subject, conflict, clearance, compartment) via `checkAccess`, and every denial is
 * audited. Two of those 7 conditions are enforced elsewhere, deliberately not duplicated here:
 * tenant match is RLS + `PrismaService.forCurrentTenant` (a query under the wrong tenant context
 * simply returns nothing); per-action role permission is enforced at the controller level via
 * `@Roles()` on mutating routes, the same pattern every other module in this codebase already
 * uses, rather than a second authorization layer inside this service.
 */
@Injectable()
export class CasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly usersService: UsersService,
    private readonly teamsService: TeamsService,
    private readonly incidentsService: IncidentsService,
    private readonly approvalService: ApprovalService,
    private readonly triageService: TriageService,
    private readonly slaClockService: SlaClockService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /** Shared by `list()` (one page) and `stats()` (the full visible set) — resolves each case's
   * linked incident ids with one direct `Incident` read (the same precedent `getSummary`'s own
   * linked-incident list already established; `Incident`'s own basic fields are tolerated for a
   * cross-module read, unlike `TriageAssessment`/`SlaClock` — see `CaseListItem`'s own doc
   * comment for why those two specifically go through their owning module's service), then one
   * batched call each to `TriageService`/`SlaClockService` — all three sharing ONE transaction
   * (see those two methods' own doc comments on the optional `tx` parameter they take for
   * exactly this). `PrismaService.forCurrentTenant` opens a real `BEGIN`/`SET_CONFIG`/`COMMIT`
   * round trip against Neon per call — found live, not a guess: an earlier version of this
   * method opened 3 separate transactions for what's really one read-only unit of work, and a
   * single `GET /cases?sevFilter=...` page load measured 10-13s end to end as a direct result.
   * One shared transaction cuts that to 1 round trip for this rollup specifically. Explicitly
   * not optimized beyond that (still one query per table inside the shared transaction,
   * regardless of case count) — fine at this codebase's current seed-data scale, not a silent
   * performance trap being left for someone else to discover at real bank scale.
   *
   * Optional `tx`: lets `list()`/`stats()` fold this into their own already-open transaction
   * instead of opening a second one — see `getVisibleCases`'s doc comment for why that's the
   * change that actually mattered, not the `Promise.all` below (kept anyway — correct and no
   * worse even though it doesn't measurably pipeline on one connection). */
  private async computeSeverityAndOverdue(
    caseIds: string[],
    tx?: TenantScopedClient,
  ): Promise<Map<string, { effectiveSeverity: SeverityTier | null; isOverdue: boolean }>> {
    if (caseIds.length === 0) return new Map();

    const query = async (client: TenantScopedClient) => {
      const incidents = await client.incident.findMany({ where: { caseId: { in: caseIds } }, select: { id: true, caseId: true } });
      const byCaseId = new Map<string, string[]>();
      for (const i of incidents) {
        if (!i.caseId) continue;
        byCaseId.set(i.caseId, [...(byCaseId.get(i.caseId) ?? []), i.id]);
      }
      const allIncidentIds = incidents.map((i) => i.id);

      const [severity, breached] = await Promise.all([
        this.triageService.getLatestSeverityByIncidentIds(allIncidentIds, client),
        this.slaClockService.getBreachedIncidentIds(allIncidentIds, client),
      ]);
      return { incidentIdsByCaseId: byCaseId, severityByIncidentId: severity, breachedIncidentIds: breached };
    };
    const { incidentIdsByCaseId, severityByIncidentId, breachedIncidentIds } = tx ? await query(tx) : await this.prisma.forCurrentTenant(query);

    const result = new Map<string, { effectiveSeverity: SeverityTier | null; isOverdue: boolean }>();
    for (const caseId of caseIds) {
      const linkedIds = incidentIdsByCaseId.get(caseId) ?? [];
      let effectiveSeverity: SeverityTier | null = null;
      let isOverdue = false;
      for (const incidentId of linkedIds) {
        const severity = severityByIncidentId.get(incidentId);
        if (severity && (!effectiveSeverity || SEVERITY_RANK[severity] > SEVERITY_RANK[effectiveSeverity])) {
          effectiveSeverity = severity;
        }
        if (breachedIncidentIds.has(incidentId)) isOverdue = true;
      }
      result.set(caseId, { effectiveSeverity, isOverdue });
    }
    return result;
  }

  async create(actor: AuthenticatedUser, dto: CreateCaseDto): Promise<Case> {
    if (dto.assignedTeamId) {
      await this.teamsService.assertExists(dto.assignedTeamId);
    }
    // Visibility-check every incident to link BEFORE creating the case — a caller shouldn't be
    // able to learn an incident exists (via a validation error naming it) by trying to link it
    // to a new case, if they couldn't see it in the first place.
    if (dto.incidentIds?.length) {
      for (const incidentId of dto.incidentIds) {
        await this.incidentsService.getById(actor, incidentId);
      }
    }

    let created: Case;
    try {
      created = await this.prisma.forCurrentTenant(async (tx) => {
        const referenceCode = await this.generateReferenceCode(tx, actor.tenantId);
        const created = await tx.case.create({
          data: {
            tenantId: actor.tenantId,
            referenceCode,
            title: dto.title,
            description: dto.description,
            sensitivityLevel: dto.sensitivityLevel,
            compartment: dto.compartment ?? Compartment.STANDARD,
            assignedTeamId: dto.assignedTeamId,
            createdBy: actor.sub,
          },
        });
        await tx.caseStatusHistory.create({
          data: { tenantId: actor.tenantId, caseId: created.id, fromStatus: null, toStatus: CaseStatus.OPEN, changedBy: actor.sub },
        });
        return created;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Same race/backstop pattern as IncidentsService.createFromSignal and
        // ConfigurationService.createDraft — two cases created in the same instant computed the
        // same reference code.
        throw new BadRequestException('Reference code collision — retry creating this case');
      }
      throw err;
    }

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'cases.case.create',
      entityType: 'Case',
      entityId: created.id,
      outcome: AuditOutcome.SUCCESS,
      metadata: { referenceCode: created.referenceCode, sensitivityLevel: created.sensitivityLevel, compartment: created.compartment },
    });

    if (dto.incidentIds?.length) {
      for (const incidentId of dto.incidentIds) {
        await this.incidentsService.linkToCase(actor, incidentId, created.id);
      }
    }

    return created;
  }

  /** Filters every case in the tenant down to the ones `actor` can actually access, batching
   * the cross-module lookups (compartment grants, team memberships) and the subject/conflict
   * flag lookup into one query each up front, rather than N+1 per case — see
   * TeamsService.getUserTeamIds's own doc comment for why that matters against this project's
   * real database. Silent filtering, not an audited denial per row, matching
   * IncidentsService.list's same precedent. */
  /** Pagination happens in-memory, over the already access-filtered set — same reasoning as
   * `IncidentsService.list`'s own doc comment: a SQL-level LIMIT/OFFSET applied before the
   * 7-condition filter would return pages padded down below `limit`. */
  /** Everything below runs inside ONE `forCurrentTenant` transaction, passed explicitly to
   * `getVisibleCases`/`computeSeverityAndOverdue`/the teams+counts read — this used to be 2-3
   * separate transactions (one per nested call defaulting to its own), and measured live, THAT
   * was the actual cost, not the in-memory filtering between steps: each `forCurrentTenant` call
   * is its own `BEGIN`/`SET_CONFIG`/`COMMIT` round trip to Neon, on top of this dev environment's
   * own ~230ms RTT to its region, so 3 transactions cost 3x that overhead regardless of how fast
   * the queries inside each one are.
   *
   * 2026-11-16: this method briefly also ran a `cases.case.list_filtered` audit write (for cases
   * silently excluded from the list) concurrently with the enrichment work below. Removed after
   * an explicit audit-policy call: a case being routinely excluded from "show me everything I can
   * see" was never actually a *denial* in the sense CLAUDE.md non-negotiable #6 means — only a
   * specific request for a case the user can't open (`assertAccess`, e.g. `GET /cases/:id`) is.
   * That write was also, by a wide margin, the single biggest cost this whole area's investigation
   * found — see `docs/CHANGELOG.md`'s dated entry for the full reasoning and the policy owner's
   * decision. */
  async list(
    actor: AuthenticatedUser,
    status?: CaseStatus,
    limit = DEFAULT_PAGE_SIZE,
    offset = 0,
    compartment?: Compartment,
    sensitivityLevel?: number,
    q?: string,
    sevFilter?: 's1-s2' | 'overdue',
  ): Promise<{ cases: CaseListItem[]; total: number }> {
    return this.prisma.forCurrentTenant(async (tx) => {
      let visible = await this.getVisibleCases(actor, status, tx);
      if (compartment) visible = visible.filter((c) => c.compartment === compartment);
      if (sensitivityLevel) visible = visible.filter((c) => c.sensitivityLevel === sensitivityLevel);
      if (q) {
        const needle = q.trim().toLowerCase();
        visible = visible.filter((c) => c.title.toLowerCase().includes(needle) || c.referenceCode.toLowerCase().includes(needle));
      }

      // Computed over the full (pre-pagination) visible set whenever `sevFilter` needs it, so
      // filtering/counting is correct — see `computeSeverityAndOverdue`'s own doc comment on why
      // this is explicitly scoped to this codebase's current seed-data scale.
      const severityAndOverdueByCaseId = sevFilter
        ? await this.computeSeverityAndOverdue(visible.map((c) => c.id), tx)
        : new Map<string, { effectiveSeverity: SeverityTier | null; isOverdue: boolean }>();
      if (sevFilter === 's1-s2') {
        visible = visible.filter((c) => {
          const sev = severityAndOverdueByCaseId.get(c.id)?.effectiveSeverity;
          return sev === 'S1' || sev === 'S2';
        });
      } else if (sevFilter === 'overdue') {
        visible = visible.filter((c) => severityAndOverdueByCaseId.get(c.id)?.isOverdue);
      }

      const page = visible.slice(offset, offset + limit);
      const needsTeams = page.some((c) => c.assignedTeamId);
      const [teams, counts]: [Team[], { id: string; _count: { incidents: number } }[]] = await Promise.all([
        needsTeams ? this.teamsService.list(tx) : [],
        page.length
          ? tx.case.findMany({ where: { id: { in: page.map((c) => c.id) } }, select: { id: true, _count: { select: { incidents: true } } } })
          : [],
      ]);
      const teamNameById = new Map<string, string>(teams.map((t) => [t.id, t.name]));
      const incidentCountById = new Map<string, number>(counts.map((c) => [c.id, c._count.incidents]));
      // Only recompute for the page if we didn't already compute it over the whole visible set
      // above (no `sevFilter` means the map is still empty).
      const pageSeverityAndOverdue = sevFilter ? severityAndOverdueByCaseId : await this.computeSeverityAndOverdue(page.map((c) => c.id), tx);

      return {
        cases: page.map((c) => ({
          ...c,
          linkedIncidentsCount: incidentCountById.get(c.id) ?? 0,
          assignedTeamName: c.assignedTeamId ? (teamNameById.get(c.assignedTeamId) ?? null) : null,
          effectiveSeverity: pageSeverityAndOverdue.get(c.id)?.effectiveSeverity ?? null,
          isOverdue: pageSeverityAndOverdue.get(c.id)?.isOverdue ?? false,
        })),
        total: visible.length,
      };
    });
  }

  /** Tenant-wide KPI summary for the cases list page — same access-filtered set `list()` computes
   * (never a raw unfiltered count), plus a cross-case loss/recovery aggregate mirroring
   * RecoveryService.getSummary's per-case version. */
  async stats(actor: AuthenticatedUser): Promise<CaseStats> {
    return this.prisma.forCurrentTenant(async (tx) => {
      const visible = await this.getVisibleCases(actor, undefined, tx);
      const visibleIds = visible.map((c) => c.id);

      const byStatus: Record<CaseStatus, number> = { OPEN: 0, UNDER_INVESTIGATION: 0, ON_HOLD: 0, CLOSED: 0 };
      for (const c of visible) byStatus[c.status]++;
      const highSensitivityCount = visible.filter((c) => c.sensitivityLevel === 4).length;

      const closedDurationsDays = visible
        .filter((c) => c.status === CaseStatus.CLOSED && c.closedAt)
        .map((c) => (c.closedAt!.getTime() - c.createdAt.getTime()) / 86_400_000);
      const meanDaysToClose = closedDurationsDays.length
        ? Math.round((closedDurationsDays.reduce((a, b) => a + b, 0) / closedDurationsDays.length) * 10) / 10
        : null;

      const [severityAndOverdueByCaseId, [{ totalLoss, totalRecovered }, pendingApprovals]] = await Promise.all([
        this.computeSeverityAndOverdue(visibleIds, tx),
        visibleIds.length
          ? Promise.all([getLossRecoveryTotals(tx, visibleIds), this.approvalService.countPending(visibleIds, tx)])
          : Promise.resolve([{ totalLoss: new Prisma.Decimal(0), totalRecovered: new Prisma.Decimal(0) }, 0] as const),
      ]);
      const bySeverity: Record<SeverityTier, number> = { S1: 0, S2: 0, S3: 0, S4: 0 };
      let overdueCount = 0;
      for (const { effectiveSeverity, isOverdue } of severityAndOverdueByCaseId.values()) {
        if (effectiveSeverity) bySeverity[effectiveSeverity]++;
        if (isOverdue) overdueCount++;
      }

      return {
        total: visible.length,
        byStatus,
        bySeverity,
        overdueCount,
        highSensitivityCount,
        pendingApprovals,
        totalLoss: totalLoss.toFixed(2),
        totalRecovered: totalRecovered.toFixed(2),
        outstanding: totalLoss.sub(totalRecovered).toFixed(2),
        currency: 'NGN',
        meanDaysToClose,
      };
    });
  }

  /** Shared access-filtering batch path behind both `list()` and `stats()` — see `list()`'s
   * original doc comment (still accurate) on why this batches the cross-module lookups instead of
   * querying per case, and why pagination/filtering happens in-memory over this already
   * access-filtered set rather than at the SQL layer.
   *
   * All 4 reads below now share ONE transaction instead of opening 4 — found live, not a guess:
   * every single case-access check in this entire codebase runs through this method (`list`,
   * `stats`, `getVisibleCaseIds`, which every evidence/recovery/capa/investigations/tasks/
   * approvals/containment/regulatory cross-case register also calls), and measuring it after
   * adding `computeSeverityAndOverdue` showed an unfiltered `/cases` page load — no severity
   * rollup involved beyond the current page — still cost ~9s. `PrismaService.forCurrentTenant`
   * opens a real `BEGIN`/`SET_CONFIG`/`COMMIT` round trip against Neon per call, and this method
   * was doing 4 of them sequentially for what's really one read-only access-check unit of work.
   * One shared transaction cuts that to 1 round trip, app-wide. The 4 reads inside it were still
   * sequential `await`s, though, each still paying this dev environment's own ~230ms RTT to its
   * Neon region in turn — none of the 4 depends on another's result, so `Promise.all` lets the
   * driver pipeline them instead of waiting out each round trip one at a time — confirmed live
   * this did NOT meaningfully help on its own: an interactive transaction runs on one physical
   * connection, so Postgres still executes the 4 queries one at a time regardless of `Promise.all`
   * at the JS layer. The real lever turned out to be `tx`: an optional parameter so `list()`/
   * `stats()` can pass in their own already-open transaction instead of each nested call
   * (`getVisibleCases`, `computeSeverityAndOverdue`, the teams/counts/loss-recovery reads) opening
   * its own — measured live, merging 3 separate transactions into 1 per request is what actually
   * cut `/cases`'s wall-clock time, not reordering awaits within a transaction that was already
   * shared.
   *
   * 2026-11-16: this method briefly also wrote a `cases.case.list_filtered` audit event whenever
   * any case was filtered out of the result — removed after an explicit audit-policy decision: a
   * case excluded from "show me everything I can see" was never actually a *denial* in the sense
   * CLAUDE.md non-negotiable #6 means (a specific request for a thing the user can't open —
   * `assertAccess`'s domain, e.g. `GET /cases/:id`). Routine row-level filtering on every list/
   * stats load isn't that, and auditing it anyway was also, by a wide margin, the single biggest
   * cost this area's whole concurrency/latency investigation found (a per-tenant hash-chain lock
   * held on every ordinary page load) — see `docs/CHANGELOG.md`'s dated entry for the full
   * reasoning and measurements. */
  private async getVisibleCases(actor: AuthenticatedUser, status?: CaseStatus, tx?: TenantScopedClient): Promise<Case[]> {
    const query = (client: TenantScopedClient) =>
      Promise.all([
        client.case.findMany({ where: status ? { status } : undefined, orderBy: { createdAt: 'desc' } }),
        this.usersService.getGrantedCompartments(actor.sub, client),
        this.teamsService.getUserTeamIds(actor.sub, client),
        this.getFlaggedCaseIds(actor.sub, client),
      ]);
    const [all, grantedCompartments, userTeamIds, deniedCaseIds] = tx ? await query(tx) : await this.prisma.forCurrentTenant(query);

    return all.filter((c) => this.isAccessible(actor, c, grantedCompartments, userTeamIds, deniedCaseIds) === null);
  }

  /** Public wrapper around `getVisibleCases` for other modules' cross-case "queue" endpoints
   * (evidence/recovery/capa — added 2026-10-14 for the 20-role dashboard expansion) that need "every
   * case this actor can access," not one specific case. Keeps the access-filtering logic itself in
   * one place rather than each queue re-deriving it. */
  async getVisibleCaseIds(actor: AuthenticatedUser): Promise<string[]> {
    const visible = await this.getVisibleCases(actor);
    return visible.map((c) => c.id);
  }

  /** Cross-module "I already know these are visible case ids, I just need their
   * referenceCode/title for display" read — `RecoveryService.listAll`/`InvestigationsService.
   * listAll` each used to run `tx.case.findMany(...)` directly against `cases`' own table instead
   * of going through this module's public interface (non-negotiable #2). Takes an already-
   * resolved id list (not an actor) since every caller already did its own access-filtered
   * `getVisibleCaseIds` lookup first — this is purely the display-field join, not a second access
   * check. Optional `tx`: same "share the caller's already-open transaction instead of opening a
   * second one" reasoning as every other batched cross-module read in this codebase. */
  async getCaseSummariesByIds(caseIds: string[], tx?: TenantScopedClient): Promise<Map<string, { referenceCode: string; title: string }>> {
    if (caseIds.length === 0) return new Map();
    const query = (client: TenantScopedClient) =>
      client.case.findMany({ where: { id: { in: caseIds } }, select: { id: true, referenceCode: true, title: true } });
    const cases = tx ? await query(tx) : await this.prisma.forCurrentTenant(query);
    return new Map(cases.map((c) => [c.id, { referenceCode: c.referenceCode, title: c.title }]));
  }

  /** Throws NotFoundException if the case doesn't exist in this tenant, or ForbiddenException
   * (with an audited denial naming which of the 7 conditions failed) otherwise. */
  async getById(actor: AuthenticatedUser, id: string): Promise<Case> {
    const caseRecord = await this.findOrThrow(id);
    await this.assertAccess(actor, caseRecord);
    return caseRecord;
  }

  /** Cheap per-case enrichment for the case-detail header's stats ribbon — deliberately a
   * separate method from `getById` rather than changing that method's return shape, since a
   * dozen call sites in this file already depend on `getById` resolving to a bare `Case`. Reuses
   * `getById`'s own access check first. `linkedIncidents` (added for the case-detail right rail's
   * per-incident SLA panel — there is no case-level SLA clock, only `SlaClock.incidentId`, see
   * `SlaClockService`'s own doc comment) is the actual id/referenceCode list, not just a count. */
  async getSummary(
    actor: AuthenticatedUser,
    id: string,
  ): Promise<{
    linkedIncidentsCount: number;
    linkedIncidents: { id: string; referenceCode: string }[];
    flagsCount: number;
    assignedTeamName: string | null;
  }> {
    const caseRecord = await this.getById(actor, id);
    const [linkedIncidents, flagsCount, team] = await Promise.all([
      this.prisma.forCurrentTenant((tx) => tx.incident.findMany({ where: { caseId: id }, select: { id: true, referenceCode: true } })),
      this.prisma.forCurrentTenant((tx) => tx.caseUserFlag.count({ where: { caseId: id } })),
      caseRecord.assignedTeamId ? this.teamsService.assertExists(caseRecord.assignedTeamId) : Promise.resolve(null),
    ]);
    return { linkedIncidentsCount: linkedIncidents.length, linkedIncidents, flagsCount, assignedTeamName: team?.name ?? null };
  }

  /**
   * The one concrete integration point this codebase's `workflow` module wires up (see that
   * module's own doc comment in schema.prisma): closing a case requires `dto.approvalId` to
   * reference an already-APPROVED `ApprovalRequest` (action=CASE_CLOSURE) for this exact case —
   * CD-04's "Case closure" row, enforced mechanically once a human has made the actual approval
   * judgment call (which severity band applies, via `POST /cases/:id/approvals`). No other
   * status transition requires approval; this is deliberately narrow, not a general workflow
   * gate on every transition.
   */
  async updateStatus(actor: AuthenticatedUser, id: string, dto: UpdateCaseStatusDto): Promise<Case> {
    const caseRecord = await this.getById(actor, id);
    if (caseRecord.status === dto.status) {
      throw new BadRequestException(`Case is already ${dto.status.toLowerCase()}`);
    }
    if (dto.status === CaseStatus.CLOSED) {
      await this.approvalService.assertApproved(id, ApprovalAction.CASE_CLOSURE, dto.approvalId!);
    }

    /** Reopening a closed case — asymmetric-rigor fix (2026-11-14, from the Phase 0 engineering
     * assessment): closing a case requires a maker-checker-approved decision; reopening one
     * previously required nothing at all. A full approval gate here would need a new
     * `ApprovalAction` enum value, a Prisma migration, and a CD-04 approval-matrix entry — a
     * bigger, policy-owning change than this pass is scoped for (CD-04 is still an unratified
     * draft; adding a line to it isn't something to do silently inside a "small fix"). This closes
     * the gap with what's available today without any of that: only an elevated/oversight role
     * may reopen, and must give a real, substantive reason — not a full maker-checker flow, but no
     * longer "nothing at all" either. */
    if (caseRecord.status === CaseStatus.CLOSED) {
      if (!ELEVATED_ROLES.includes(actor.role)) {
        throw new ForbiddenException('Reopening a closed case requires an elevated oversight role.');
      }
      if (!dto.reason || dto.reason.trim().length < 5) {
        throw new BadRequestException('Reopening a closed case requires a reason of at least 5 characters.');
      }
    }

    const updated = await this.prisma.forCurrentTenant(async (tx) => {
      const updated = await tx.case.update({
        where: { id },
        data: { status: dto.status, closedAt: dto.status === CaseStatus.CLOSED ? new Date() : undefined },
      });
      await tx.caseStatusHistory.create({
        data: {
          tenantId: actor.tenantId,
          caseId: id,
          fromStatus: caseRecord.status,
          toStatus: dto.status,
          reason: dto.reason,
          changedBy: actor.sub,
        },
      });
      return updated;
    });

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'cases.case.status_change',
      entityType: 'Case',
      entityId: id,
      outcome: AuditOutcome.SUCCESS,
      metadata: { fromStatus: caseRecord.status, toStatus: dto.status },
    });

    this.eventEmitter.emit(CASE_STATUS_CHANGED_EVENT, {
      tenantId: actor.tenantId,
      caseId: id,
      referenceCode: updated.referenceCode,
      fromStatus: caseRecord.status,
      toStatus: dto.status,
      changedBy: actor.sub,
      assignedTeamId: updated.assignedTeamId,
    } satisfies CaseStatusChangedEvent);

    return updated;
  }

  async assignTeam(actor: AuthenticatedUser, id: string, dto: AssignCaseTeamDto): Promise<Case> {
    await this.getById(actor, id);
    await this.teamsService.assertExists(dto.teamId);

    const updated = await this.prisma.forCurrentTenant((tx) =>
      tx.case.update({ where: { id }, data: { assignedTeamId: dto.teamId } }),
    );

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'cases.case.assign_team',
      entityType: 'Case',
      entityId: id,
      outcome: AuditOutcome.SUCCESS,
      metadata: { teamId: dto.teamId },
    });

    return updated;
  }

  /** Real version of what the "team assignment conflict check" mockup was actually reaching
   * for underneath its fabricated PEP/beneficial-ownership screening and fake hardware-token
   * table (neither of which this codebase has or needs) — the one real, already-enforced rule
   * this CAN surface proactively: a team member who is flagged `SUBJECT` or `CONFLICT` on this
   * case (non-negotiable #6) will be denied access the moment they try to open it regardless of
   * team assignment, so telling the assigner *before* they assign the team is a real usability
   * improvement, not a new security boundary — the access check itself is unchanged and already
   * correct. Purely advisory: never blocks the assignment itself, same "surface it, let the
   * human decide" posture as every other advisory check in this codebase. */
  async checkTeamConflicts(actor: AuthenticatedUser, id: string, teamId: string): Promise<TeamConflictCheckResult> {
    await this.getById(actor, id);
    await this.teamsService.assertExists(teamId);

    const [memberIds, flags, users] = await Promise.all([
      this.teamsService.listMemberIds(teamId),
      this.prisma.forCurrentTenant((tx) => tx.caseUserFlag.findMany({ where: { caseId: id } })),
      this.usersService.list(actor),
    ]);

    const flagByUserId = new Map(flags.map((f) => [f.userId, f]));
    const userById = new Map(users.map((u) => [u.id, u]));

    const conflictedMembers = memberIds
      .filter((userId) => flagByUserId.has(userId))
      .map((userId) => {
        const flag = flagByUserId.get(userId)!;
        return {
          userId,
          fullName: userById.get(userId)?.fullName ?? 'Unknown user',
          flagType: flag.type,
          reason: flag.reason,
        };
      });

    return { teamId, memberCount: memberIds.length, conflictedMembers };
  }

  /** Loops the existing, unchanged `assignTeam` per case — reused, not duplicated — continuing
   * past a per-item failure (stale id, access denied, bad team) rather than failing the whole
   * batch. An honest partial-success shape: a queue selection of 6 where 1 case went stale
   * shouldn't fail the other 5. */
  async bulkAssignTeam(actor: AuthenticatedUser, dto: BulkAssignCasesDto): Promise<{ succeeded: string[]; failed: { caseId: string; reason: string }[] }> {
    const succeeded: string[] = [];
    const failed: { caseId: string; reason: string }[] = [];
    for (const caseId of dto.caseIds) {
      try {
        await this.assignTeam(actor, caseId, { teamId: dto.teamId });
        succeeded.push(caseId);
      } catch (err) {
        failed.push({ caseId, reason: err instanceof Error ? err.message : 'Unknown error' });
      }
    }
    return { succeeded, failed };
  }

  /** Loops `updateStatus` per case, moving each to `UNDER_INVESTIGATION` — "escalate" reuses the
   * one real status transition that already means "this needs active work now" (there's no
   * separate `Case`-owned escalation concept). A case already `UNDER_INVESTIGATION` is treated as
   * already-satisfied (included in `succeeded`), not a failure: `updateStatus` itself throws on
   * "already this status", correct for one deliberate transition but wrong for a bulk action over
   * a queue selection that naturally includes some already-escalated cases. Emits one
   * `CASE_ESCALATED_EVENT` for the whole batch (not per case) so `NotificationsService` resolves
   * every case's team lead from a single event. */
  async bulkEscalate(actor: AuthenticatedUser, dto: BulkEscalateCasesDto): Promise<{ succeeded: string[]; failed: { caseId: string; reason: string }[] }> {
    const succeeded: string[] = [];
    const failed: { caseId: string; reason: string }[] = [];
    const escalated: CaseEscalatedEvent['cases'] = [];

    for (const caseId of dto.caseIds) {
      try {
        const current = await this.getById(actor, caseId);
        if (current.status === CaseStatus.UNDER_INVESTIGATION) {
          succeeded.push(caseId);
          continue;
        }
        const updated = await this.updateStatus(actor, caseId, { status: CaseStatus.UNDER_INVESTIGATION, reason: dto.reason });
        succeeded.push(caseId);
        escalated.push({ caseId, referenceCode: updated.referenceCode, assignedTeamId: updated.assignedTeamId });
      } catch (err) {
        failed.push({ caseId, reason: err instanceof Error ? err.message : 'Unknown error' });
      }
    }

    if (escalated.length > 0) {
      this.eventEmitter.emit(CASE_ESCALATED_EVENT, {
        tenantId: actor.tenantId,
        escalatedBy: actor.sub,
        reason: dto.reason,
        cases: escalated,
      } satisfies CaseEscalatedEvent);
    }

    return { succeeded, failed };
  }

  async linkIncident(actor: AuthenticatedUser, id: string, dto: LinkIncidentDto): Promise<void> {
    await this.getById(actor, id);
    await this.incidentsService.linkToCase(actor, dto.incidentId, id);
  }

  async addFlag(actor: AuthenticatedUser, id: string, dto: AddCaseUserFlagDto): Promise<CaseUserFlag> {
    await this.getById(actor, id);
    await this.usersService.assertUserExists(dto.userId);

    // Delete-then-recreate, not upsert — case_user_flags deliberately has no UPDATE grant (see
    // its doc comment in schema.prisma and the REVOKE in rls-policies.sql), but Prisma's
    // .upsert() compiles to `INSERT ... ON CONFLICT DO UPDATE`, which Postgres requires UPDATE
    // privilege for even on the path that never actually updates anything — caught live
    // ("permission denied for table case_user_flags") the first time this route was exercised
    // against the real database with a genuinely non-superuser role, exactly the class of bug
    // that only shows up once RLS/grants are real instead of assumed.
    const flag = await this.prisma.forCurrentTenant(async (tx) => {
      await tx.caseUserFlag.deleteMany({ where: { caseId: id, userId: dto.userId, type: dto.type } });
      return tx.caseUserFlag.create({
        data: {
          tenantId: actor.tenantId,
          caseId: id,
          userId: dto.userId,
          type: dto.type,
          reason: dto.reason,
          flaggedBy: actor.sub,
        },
      });
    });

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'cases.case.flag_add',
      entityType: 'CaseUserFlag',
      entityId: flag.id,
      outcome: AuditOutcome.SUCCESS,
      metadata: { caseId: id, flaggedUserId: dto.userId, type: dto.type },
    });

    return flag;
  }

  async removeFlag(actor: AuthenticatedUser, id: string, flagId: string): Promise<void> {
    await this.getById(actor, id);

    const flag = await this.prisma.forCurrentTenant((tx) => tx.caseUserFlag.findUnique({ where: { id: flagId } }));
    if (!flag || flag.caseId !== id) {
      throw new NotFoundException('Flag not found on this case');
    }

    await this.prisma.forCurrentTenant((tx) => tx.caseUserFlag.delete({ where: { id: flagId } }));

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'cases.case.flag_remove',
      entityType: 'CaseUserFlag',
      entityId: flagId,
      outcome: AuditOutcome.SUCCESS,
      metadata: { caseId: id, flaggedUserId: flag.userId, type: flag.type },
    });
  }

  /** Read counterpart to `addFlag`/`removeFlag` — added once the frontend's case detail page
   * needed to actually show existing flags before adding/removing one, not just write them
   * blind. Delegates the access check to `getById` first, same as every other case-scoped read
   * in this service. */
  async listFlags(actor: AuthenticatedUser, id: string): Promise<CaseUserFlag[]> {
    await this.getById(actor, id);
    return this.prisma.forCurrentTenant((tx) => tx.caseUserFlag.findMany({ where: { caseId: id }, orderBy: { flaggedAt: 'desc' } }));
  }

  /** Read counterpart to the status-history rows `updateStatus` already writes — same "the
   * frontend genuinely needs this to render, not a speculative addition" reasoning as
   * `listFlags`. */
  async listStatusHistory(actor: AuthenticatedUser, id: string): Promise<CaseStatusHistory[]> {
    await this.getById(actor, id);
    return this.prisma.forCurrentTenant((tx) =>
      tx.caseStatusHistory.findMany({ where: { caseId: id }, orderBy: { changedAt: 'desc' } }),
    );
  }

  private async findOrThrow(id: string): Promise<Case> {
    const caseRecord = await this.prisma.forCurrentTenant((tx) => tx.case.findUnique({ where: { id } }));
    if (!caseRecord) {
      throw new NotFoundException('Case not found');
    }
    return caseRecord;
  }

  /** Runs the single-record path of the access check (one query per remaining condition, each
   * short-circuited by the previous — cheap enough for a single case, unlike `list`'s batch
   * path) and audits+throws on denial. */
  private async assertAccess(actor: AuthenticatedUser, caseRecord: Case): Promise<void> {
    let denialReason: string | null = null;

    if (caseRecord.assignedTeamId && !ELEVATED_ROLES.includes(actor.role)) {
      const onTeam = await this.teamsService.isUserOnTeam(actor.sub, caseRecord.assignedTeamId);
      if (!onTeam) {
        denialReason = 'not_on_assigned_team';
      }
    }

    if (!denialReason) {
      const flag = await this.prisma.forCurrentTenant((tx) =>
        tx.caseUserFlag.findFirst({ where: { caseId: caseRecord.id, userId: actor.sub } }),
      );
      if (flag?.type === CaseUserRelationType.SUBJECT) {
        denialReason = 'user_is_subject';
      } else if (flag?.type === CaseUserRelationType.CONFLICT) {
        denialReason = 'user_has_conflict';
      }
    }

    if (!denialReason && actor.clearanceLevel < caseRecord.sensitivityLevel) {
      denialReason = 'insufficient_clearance';
    }

    if (!denialReason && caseRecord.compartment !== Compartment.STANDARD) {
      const granted = await this.usersService.getGrantedCompartments(actor.sub);
      if (!granted.includes(caseRecord.compartment)) {
        denialReason = 'compartment_not_authorized';
      }
    }

    if (denialReason) {
      await this.auditService.record({
        tenantId: actor.tenantId,
        actorUserId: actor.sub,
        action: 'cases.case.view',
        entityType: 'Case',
        entityId: caseRecord.id,
        outcome: AuditOutcome.DENIED,
        metadata: { reason: denialReason },
      });
      throw new ForbiddenException('Not authorized to access this case');
    }
  }

  /** Pure, synchronous version of the same 7-condition check for `list`'s batch path, given
   * pre-fetched context — returns a denial reason string, or null if access is allowed. Kept as
   * a second implementation rather than sharing code with `assertAccess` because the two have
   * genuinely different data-access shapes (one query per case here would defeat the point of
   * batching); see `list`'s own doc comment. */
  private isAccessible(
    actor: AuthenticatedUser,
    caseRecord: Case,
    grantedCompartments: Compartment[],
    userTeamIds: string[],
    deniedCaseIds: Set<string>,
  ): string | null {
    if (caseRecord.assignedTeamId && !ELEVATED_ROLES.includes(actor.role) && !userTeamIds.includes(caseRecord.assignedTeamId)) {
      return 'not_on_assigned_team';
    }
    if (deniedCaseIds.has(caseRecord.id)) {
      return 'flagged';
    }
    if (actor.clearanceLevel < caseRecord.sensitivityLevel) {
      return 'insufficient_clearance';
    }
    if (caseRecord.compartment !== Compartment.STANDARD && !grantedCompartments.includes(caseRecord.compartment)) {
      return 'compartment_not_authorized';
    }
    return null;
  }

  /** Optional `tx`: see `getVisibleCases`'s own doc comment — same "share the caller's
   * transaction instead of opening a second one" reasoning. */
  private async getFlaggedCaseIds(userId: string, tx?: TenantScopedClient): Promise<Set<string>> {
    const query = (client: TenantScopedClient) => client.caseUserFlag.findMany({ where: { userId }, select: { caseId: true } });
    const flags = tx ? await query(tx) : await this.prisma.forCurrentTenant(query);
    return new Set(flags.map((f) => f.caseId));
  }

  /** "CASE-{year}-{seq}" — same MAX-based (not COUNT-based) generation as `IncidentsService`'s
   * own `generateReferenceCode`; see that method's doc comment for why COUNT is wrong — it
   * undercounts the moment any row in this prefix is ever deleted, and a rolled-back insert never
   * changes the COUNT, so every retry after a gap would recompute the same already-taken code
   * forever. The (tenantId, referenceCode) unique constraint remains the backstop for genuine
   * concurrent-writer races. */
  private async generateReferenceCode(tx: TenantScopedClient, tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `CASE-${year}-`;
    const existing = await tx.case.findMany({
      where: { tenantId, referenceCode: { startsWith: prefix } },
      select: { referenceCode: true },
    });
    const maxSeq = existing.reduce((max, { referenceCode }) => {
      const seq = Number(referenceCode.slice(prefix.length));
      return Number.isFinite(seq) && seq > max ? seq : max;
    }, 0);
    return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
  }
}
