import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { AuditEvent, AuditOutcome, Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user.interface';
// `import type` only, deliberately — see `onModuleInit`'s doc comment below for why a real
// (value) import of either of these two right here reintroduces a circular require this file
// found live. Type-only imports are erased entirely by `tsc`, so they carry no runtime reference.
import type { CasesService } from '../cases/cases.service';
import type { IncidentsService } from '../incidents/incidents.service';
import { VAULT_READ_ROLES } from '../incidents/whistleblower-vault.constants';
import { computeAuditEventHash } from './audit-hash';

export interface RecordAuditEventInput {
  tenantId: string;
  actorUserId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  outcome?: AuditOutcome;
  metadata?: Prisma.InputJsonValue;
}

export interface AuditEventQuery {
  entityType?: string;
  entityId?: string;
  actorUserId?: string;
  action?: string;
  outcome?: AuditOutcome;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

export interface ChainBreak {
  eventId: string;
  action: string;
  entityType: string;
  entityId: string | null;
  createdAt: string;
  /** `hash_mismatch` — this event's own stored hash doesn't match a recomputation over its
   * stored fields (the metadata/action/etc. is inconsistent with the hash that supposedly covers
   * it). `link_mismatch` — this event's `previousHash` doesn't match the prior event's `hash`
   * (the chain of custody between two otherwise-valid events is broken). */
  reason: 'hash_mismatch' | 'link_mismatch';
}

export interface ChainVerificationResult {
  intact: boolean;
  eventsChecked: number;
  breaks: ChainBreak[];
}

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

/**
 * The real `audit` module (architecture.md: "append-only ledger, write-only API") — the
 * "write-only API" is what every OTHER module in this codebase gets: `record()`, nothing else.
 * No `find`/`update`/`delete` method is exposed to callers outside this file for that reason,
 * and `rls-policies.sql` additionally revokes UPDATE/DELETE on `audit_events` from the app's own
 * database role, so append-only holds even against a raw-SQL bug, not just method-visibility
 * discipline (CLAUDE.md non-negotiable #3). `query`/`verifyChain` exist for a different
 * consumer — `AuditController`, reachable only by oversight roles — not for other modules to
 * call; nothing outside this file should ever import them for anything but audit review.
 */
@Injectable()
export class AuditService implements OnModuleInit {
  private readonly logger = new Logger(AuditService.name);

  // Resolved lazily in `onModuleInit`, not constructor injection — see `AuditModule`'s own doc
  // comment for why: a static `CasesModule`/`IncidentsModule` import here turned out to be a real
  // circular provider graph reaching well beyond just these two services (confirmed live — the
  // app failed to boot with "UsersService (PrismaService, ?)", an undefined-dependency error, not
  // just a Nest "no provider found" one).
  private casesService!: CasesService;
  private incidentsService!: IncidentsService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
  ) {}

  /** Switching the constructor from `forwardRef`-wrapped injection to `ModuleRef.get` alone did
   * NOT fix the boot failure above — same error, verified live. Root cause turned out to be one
   * level lower than NestJS's own DI graph: a plain top-level `import { CasesService } from
   * '../cases/cases.service'` in this file closes a genuine CommonJS circular require
   * (`audit.service.ts` -> `cases.service.ts` -> `../identity/users.service.ts` -> back to
   * `audit.service.ts`, since `UsersService` itself injects `AuditService`). Node's circular
   * `require()` hands the second-to-resolve file a PARTIALLY populated module (whatever had been
   * assigned to `exports` so far), so `UsersService`'s own `@Injectable()` decorator — evaluated
   * at module-load time, not at Nest-bootstrap time — captured `AuditService` as `undefined` in
   * its `design:paramtypes` metadata, which Nest then reports as the literal `?` seen in the error.
   * This is why `forwardRef`/`ModuleRef` alone couldn't fix it: both only change how the DI
   * *container* resolves a token at bootstrap time, not how Node's module loader resolves the
   * `import` statement at file-load time, which is where the actual corruption happened.
   * `import type` (above) is erased by `tsc` — zero runtime `require()`, so no cycle. The dynamic
   * `import()` calls below run once, inside this lifecycle hook, long after every module in the
   * app has already finished its own top-level evaluation (Nest instantiates every provider before
   * calling any `onModuleInit` anywhere), so by now `cases.service.ts`'s and
   * `incidents.service.ts`'s exports are fully populated either way — this is a deliberately
   * deferred load, not a workaround for a load that would otherwise fail. */
  async onModuleInit(): Promise<void> {
    const { CasesService } = await import('../cases/cases.service');
    const { IncidentsService } = await import('../incidents/incidents.service');
    this.casesService = this.moduleRef.get(CasesService, { strict: false });
    this.incidentsService = this.moduleRef.get(IncidentsService, { strict: false });
  }

  /**
   * Every write extends a per-tenant hash chain (see `AuditEvent`'s doc comment in
   * schema.prisma). `pg_advisory_xact_lock(hashtext(tenantId))` serializes concurrent writes for
   * the SAME tenant so two simultaneous `record()` calls can't both read the same "latest" hash
   * as their `previousHash` and fork the chain — different tenants never contend with each
   * other, and the lock releases automatically at this transaction's commit or rollback, never
   * held any longer. An audit write failing must never take down the request that triggered it
   * (a login attempt shouldn't 500 because the audit insert failed) — but it must be loud, since
   * a silently-dropped audit event is exactly the failure mode non-negotiable #6 exists to
   * prevent.
   */
  async record(input: RecordAuditEventInput): Promise<void> {
    try {
      await this.prisma.withTenant(input.tenantId, async (tx) => {
        // Root-caused 2026-11-25 (see docs/production-readiness/06-audit-integrity-report.md,
        // finding AUD-01): the lock acquisition and the "latest hash" lookup used to be two
        // separate statements, then were deliberately combined into one CTE query for performance
        // (shrinking this call's own round-trip count shrinks the whole per-tenant lock queue's
        // length under load — see git history for that reasoning, still correct on its own terms).
        // That combination introduced a real correctness bug: under PostgreSQL's default READ
        // COMMITTED isolation, a single SQL statement takes ONE snapshot at the moment the
        // statement starts executing — not after any lock-wait inside that same statement
        // completes. So a call that has to wait for `pg_advisory_xact_lock` still has its SELECT
        // read from a snapshot taken BEFORE that wait, and can genuinely miss the row the
        // just-released lock-holder committed, linking onto a stale "latest" even though the lock
        // itself serialized correctly. Reproduced directly: a burst of calls fired via
        // `Promise.all` forked the chain almost every time, serialized or not, until this was
        // split back into two sequential statements — the second one, issued only after the first
        // has returned (meaning the lock is actually held and every earlier committer's work is
        // visible), gets its own fresh snapshot that correctly reflects everything already
        // committed. Both statements still run inside the one open transaction/connection
        // `withTenant` provides, so this isn't the two-round-trip-per-caller cost the original
        // combination was removing — it's one extra statement on the same connection, not a
        // second network round trip to a second connection.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.tenantId}))`;

        // `sequence`, not `createdAt` (also found during this same investigation —
        // `AuditEvent.sequence`'s doc comment in schema.prisma): `createdAt` has only millisecond
        // resolution and is generated in application code, so under real concurrent load two
        // events can tie on it. `sequence` is assigned atomically by Postgres at insert time and
        // is always strictly increasing, so there is never a tie to break. RLS already scopes
        // `audit_events` to this tenant (`current_setting('app.current_tenant')`, set by
        // `withTenant` just before this runs); the explicit `WHERE` is defense-in-depth, not the
        // only thing doing the scoping.
        const [{ hash: latestHash }] = await tx.$queryRaw<{ hash: string | null }[]>`
          SELECT hash
          FROM audit_events
          WHERE "tenantId" = ${input.tenantId}
          ORDER BY sequence DESC
          LIMIT 1
        `.then((rows) => (rows.length > 0 ? rows : [{ hash: null }]));
        const latest = latestHash !== null ? { hash: latestHash } : null;

        const createdAt = new Date();
        const outcome = input.outcome ?? AuditOutcome.SUCCESS;
        const hash = computeAuditEventHash({
          previousHash: latest?.hash ?? null,
          tenantId: input.tenantId,
          actorUserId: input.actorUserId ?? null,
          action: input.action,
          entityType: input.entityType,
          entityId: input.entityId ?? null,
          outcome,
          metadata: input.metadata ?? null,
          createdAt: createdAt.toISOString(),
        });

        await tx.auditEvent.create({
          data: {
            tenantId: input.tenantId,
            actorUserId: input.actorUserId,
            action: input.action,
            entityType: input.entityType,
            entityId: input.entityId,
            outcome,
            metadata: input.metadata,
            createdAt,
            previousHash: latest?.hash ?? null,
            hash,
          },
        });
      });
    } catch (err) {
      this.logger.error(`Failed to write audit event: ${input.action}`, err as Error);
    }
  }

  /** AUD-03 (found 2026-11-25): an `AUDIT_READ_ROLES` member with no protected-compartment grant
   * at all — `TEAM_LEAD` is the documented example — could previously still read every event in
   * the tenant via `query()`, including ones that, by their mere existence/entityId, reveal a
   * case or signal's protected-compartment membership: a `cases.case.view` DENIED row for
   * *someone else* with `metadata.reason: 'compartment_not_authorized'` names a specific case and
   * confirms it sits in a protected compartment; `incidents.whistleblower_vault.read` names a
   * specific signal and confirms it's a whistleblowing report, even though `TEAM_LEAD` could never
   * reach the vault directly (`WhistleblowerVaultService.VAULT_READ_ROLES` is narrower than
   * `AUDIT_READ_ROLES`); and — found independently during this fix, not in the original report —
   * every `incidents.signal.create` event's `metadata.source` says `'WHISTLEBLOWER'` outright for
   * the same signal, an even more direct instance of the same leak. Non-negotiable #7 exists
   * precisely to stop this class of inference for WHISTLEBLOWING, so this omits the event
   * entirely rather than redacting just the sensitive field — matching the `entities` module's own
   * "omitted entirely, never shown redacted" precedent (even a redacted placeholder confirms the
   * entity exists in a protected compartment).
   *
   * Reuses `CasesService.getVisibleCaseIds`/`IncidentsService.getVisibleIncidentIds` (the same
   * compartment check every other cross-module reader of case/incident visibility already uses)
   * rather than re-deriving compartment membership here — see `AuditModule`'s and `onModuleInit`'s
   * own doc comments for why that makes this service and `CasesService`/`IncidentsService` a
   * genuine circular dependency, resolved via `ModuleRef` plus a deferred dynamic `import()`
   * rather than constructor injection. `WhistleblowerIdentityVaultEntry` events are gated on
   * `VAULT_READ_ROLES`, imported from `whistleblower-vault.constants.ts` (not re-declared, and
   * deliberately not imported from `whistleblower-vault.service.ts` itself — see that constants
   * file's own doc comment for why). `Signal` events are gated the same way whenever the
   * referenced signal actually has a vault entry — looked up directly rather than trusted from the
   * event's own `metadata.source`, so this holds even for signal lifecycle actions whose metadata
   * shape changes later.
   *
   * Known, accepted limitation: filtering happens after the paginated database read, so `total`
   * and a page's actual visible-row count can be slightly off (overcounting, short pages) for a
   * viewer who's missing compartment grants and whose tenant has compartment-protected events in
   * range — cheap and correct for `events`, approximate for `total`. Not worth an over-fetch-and-
   * retry loop for a MEDIUM-severity, defense-in-depth fix at MVP data volumes; revisit if a
   * tenant's protected-compartment event share grows large enough to make this visible. */
  private async filterVisibleEvents(actor: AuthenticatedUser, events: AuditEvent[]): Promise<AuditEvent[]> {
    const caseIds = events.filter((e) => e.entityType === 'Case' && e.entityId).map((e) => e.entityId as string);
    const incidentIds = events.filter((e) => e.entityType === 'Incident' && e.entityId).map((e) => e.entityId as string);
    const signalIds = events.filter((e) => e.entityType === 'Signal' && e.entityId).map((e) => e.entityId as string);

    const [visibleCaseIds, visibleIncidentIds, vaultedSignalIds] = await Promise.all([
      caseIds.length > 0 ? this.casesService.getVisibleCaseIds(actor) : Promise.resolve<string[]>([]),
      incidentIds.length > 0 ? this.incidentsService.getVisibleIncidentIds(actor) : Promise.resolve<string[]>([]),
      signalIds.length > 0
        ? this.prisma
            .forCurrentTenant((tx) =>
              tx.whistleblowerIdentityVaultEntry.findMany({
                where: { signalId: { in: signalIds } },
                select: { signalId: true },
              }),
            )
            .then((rows) => new Set(rows.map((r) => r.signalId)))
        : Promise.resolve(new Set<string>()),
    ]);

    const visibleCaseIdSet = new Set(visibleCaseIds);
    const visibleIncidentIdSet = new Set(visibleIncidentIds);
    const vaultPermitted = VAULT_READ_ROLES.includes(actor.role);

    return events.filter((event) => {
      if (event.entityType === 'Case') return !!event.entityId && visibleCaseIdSet.has(event.entityId);
      if (event.entityType === 'Incident') return !!event.entityId && visibleIncidentIdSet.has(event.entityId);
      if (event.entityType === 'WhistleblowerIdentityVaultEntry') return vaultPermitted;
      if (event.entityType === 'Signal' && event.entityId && vaultedSignalIds.has(event.entityId)) return vaultPermitted;
      return true;
    });
  }

  /** Filtered, paginated read of the calling actor's own tenant's ledger — gated to oversight
   * roles at `AuditController`, not here (this service has no role check of its own, matching
   * every other service's division of labor with its controller). Every call is itself audited,
   * same "access to this is the sensitive event" reasoning as `WhistleblowerVaultService`.
   * Compartment-filtered via `filterVisibleEvents` — see that method's doc comment (AUD-03). */
  async query(actor: AuthenticatedUser, filter: AuditEventQuery): Promise<{ events: AuditEvent[]; total: number }> {
    const limit = Math.min(filter.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const offset = filter.offset ?? 0;
    const where: Prisma.AuditEventWhereInput = {
      entityType: filter.entityType,
      entityId: filter.entityId,
      actorUserId: filter.actorUserId,
      action: filter.action,
      outcome: filter.outcome,
      createdAt: filter.from || filter.to ? { gte: filter.from, lte: filter.to } : undefined,
    };

    const [rawEvents, total] = await this.prisma.forCurrentTenant((tx) =>
      Promise.all([
        tx.auditEvent.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit, skip: offset }),
        tx.auditEvent.count({ where }),
      ]),
    );
    const events = await this.filterVisibleEvents(actor, rawEvents);

    await this.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'audit.query',
      entityType: 'AuditEvent',
      outcome: AuditOutcome.SUCCESS,
      metadata: { filter: { ...filter, from: filter.from?.toISOString(), to: filter.to?.toISOString() } },
    });

    return { events, total };
  }

  /** Cheap `groupBy` summary for the audit page's KPI row — deliberately not a byproduct of
   * `query()` (which is paginated and filtered), so this always reflects the whole tenant ledger
   * regardless of what filter is currently applied on screen. `actor` is unused — considered for
   * AUD-03's compartment filter alongside `query()`, then deliberately left alone: `query()`
   * needed filtering because it exposes `entityId`/`metadata` per row (the actual leak — see
   * `filterVisibleEvents`'s doc comment), but `stats()` only ever returns aggregate counts by
   * outcome, with no entityId or metadata attached to any number. A denied-count going up by one
   * doesn't name which case or signal was involved, so there's nothing here for a compartment
   * check to filter out; applying one would cost a full-ledger fetch-and-recompute in place of a
   * cheap `groupBy`, for no confidentiality gain. Kept in the signature anyway so a future field
   * added to this summary gets the same scrutiny before shipping, not because this method needs
   * `actor` today. Not wired up to `record()` the way `query()` is: that would add one audit
   * write per page view, and this table's write path has an open, unresolved concurrency
   * investigation in progress — adding write volume to it now, to fix a lint warning, would be
   * exactly backwards. */
  async stats(_actor: AuthenticatedUser): Promise<{ total: number; byOutcome: Record<AuditOutcome, number> }> {
    const [rows, total] = await this.prisma.forCurrentTenant((tx) =>
      Promise.all([tx.auditEvent.groupBy({ by: ['outcome'], _count: { _all: true } }), tx.auditEvent.count()]),
    );
    const byOutcome = Object.fromEntries(Object.values(AuditOutcome).map((o) => [o, 0])) as Record<AuditOutcome, number>;
    for (const row of rows) byOutcome[row.outcome] = row._count._all;
    return { total, byOutcome };
  }

  /** Daily outcome trend for the audit page's new chart (added 2026-11-10 alongside the
   * frontend's first charting library) — `groupBy` can't express a date-truncated bucket, so this
   * is the one place in this service that drops to raw SQL. Still runs inside
   * `forCurrentTenant`'s transaction, so RLS applies exactly as it would to a Prisma-built query —
   * same Postgres session/transaction, same `current_setting('app.current_tenant')` scoping. */
  async trend(actor: AuthenticatedUser, days: number): Promise<{ date: string; success: number; denied: number; failure: number }[]> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.forCurrentTenant((tx) =>
      tx.$queryRaw<{ day: Date; outcome: AuditOutcome; count: bigint }[]>`
        SELECT date_trunc('day', "createdAt") AS day, "outcome", COUNT(*) AS count
        FROM "audit_events"
        WHERE "createdAt" >= ${since}
        GROUP BY day, "outcome"
        ORDER BY day ASC
      `,
    );

    const byDay = new Map<string, { success: number; denied: number; failure: number }>();
    for (const row of rows) {
      const key = row.day.toISOString().slice(0, 10);
      const entry = byDay.get(key) ?? { success: 0, denied: 0, failure: 0 };
      const count = Number(row.count);
      if (row.outcome === AuditOutcome.SUCCESS) entry.success += count;
      else if (row.outcome === AuditOutcome.DENIED) entry.denied += count;
      else if (row.outcome === AuditOutcome.FAILURE) entry.failure += count;
      byDay.set(key, entry);
    }

    await this.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'audit.trend',
      entityType: 'AuditEvent',
      outcome: AuditOutcome.SUCCESS,
      metadata: { days },
    });

    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, counts]) => ({ date, ...counts }));
  }

  /** Walks the calling actor's tenant's entire chain in order and recomputes every hash —
   * O(n) in the number of events, acceptable at MVP volumes; a large-ledger optimization
   * (checkpointing, incremental verification from the last known-good point) is future work, not
   * invented ahead of need. A `hash === null` row (written before this feature's one-time
   * backfill ran) is skipped rather than treated as a break — it predates the chain, it isn't
   * evidence of tampering with it.
   *
   * Deliberately does NOT stop at the first break. `expectedPreviousHash` advances to this
   * event's own stored `hash` regardless of whether it validated, so one historical break (e.g.
   * the `configuration.ratify`/`regulatory.obligation.create` Date-serialization bug fixed in
   * `audit-hash.ts` — see `docs/CHANGELOG.md`'s 2026-09-30 entry) doesn't cascade into flagging
   * every event written after it too. Collecting every independent break, not just the first,
   * is what makes it possible to tell "one documented, root-caused historical bug" apart from
   * "an unknown number of breaks, could be anything" — non-negotiable #3 means those broken rows
   * can never be rewritten, so this is the only honest way to report the chain's actual shape. */
  async verifyChain(actor: AuthenticatedUser): Promise<ChainVerificationResult> {
    // `sequence`, not `createdAt` — see `AuditEvent.sequence`'s doc comment in schema.prisma and
    // `record()`'s matching comment: `createdAt` ties under concurrent writes made this traversal
    // order potentially disagree with the order events were actually linked in at write time,
    // which independently produced apparent breaks even when the written chain was internally
    // consistent in true commit order. `sequence` has no ties to disagree about.
    const events = await this.prisma.forCurrentTenant((tx) => tx.auditEvent.findMany({ orderBy: { sequence: 'asc' } }));

    let expectedPreviousHash: string | null = null;
    const breaks: ChainBreak[] = [];

    for (const event of events) {
      if (event.hash === null) {
        expectedPreviousHash = null;
        continue;
      }

      const linkBroken = event.previousHash !== expectedPreviousHash;
      const recomputed = computeAuditEventHash({
        previousHash: event.previousHash,
        tenantId: event.tenantId,
        actorUserId: event.actorUserId,
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
        outcome: event.outcome,
        metadata: event.metadata,
        createdAt: event.createdAt.toISOString(),
      });
      const hashBroken = recomputed !== event.hash;

      if (linkBroken || hashBroken) {
        breaks.push({
          eventId: event.id,
          action: event.action,
          entityType: event.entityType,
          entityId: event.entityId,
          createdAt: event.createdAt.toISOString(),
          reason: hashBroken ? 'hash_mismatch' : 'link_mismatch',
        });
      }
      // Always resume from this event's actual stored hash — see the doc comment above.
      expectedPreviousHash = event.hash;
    }

    const result: ChainVerificationResult = { intact: breaks.length === 0, eventsChecked: events.length, breaks };

    await this.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'audit.verify_chain',
      entityType: 'AuditEvent',
      outcome: result.intact ? AuditOutcome.SUCCESS : AuditOutcome.FAILURE,
      metadata: { ...result } as unknown as Prisma.InputJsonValue,
    });

    return result;
  }
}
