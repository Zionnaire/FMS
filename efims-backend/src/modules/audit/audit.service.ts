import { Injectable, Logger } from '@nestjs/common';
import { AuditEvent, AuditOutcome, Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user.interface';
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
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

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
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.tenantId}))`;

        const latest = await tx.auditEvent.findFirst({
          where: { tenantId: input.tenantId },
          orderBy: { createdAt: 'desc' },
          select: { hash: true },
        });

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

  /** Filtered, paginated read of the calling actor's own tenant's ledger — gated to oversight
   * roles at `AuditController`, not here (this service has no role check of its own, matching
   * every other service's division of labor with its controller). Every call is itself audited,
   * same "access to this is the sensitive event" reasoning as `WhistleblowerVaultService`. */
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

    const [events, total] = await this.prisma.forCurrentTenant((tx) =>
      Promise.all([
        tx.auditEvent.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit, skip: offset }),
        tx.auditEvent.count({ where }),
      ]),
    );

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
   * regardless of what filter is currently applied on screen. */
  async stats(actor: AuthenticatedUser): Promise<{ total: number; byOutcome: Record<AuditOutcome, number> }> {
    const [rows, total] = await this.prisma.forCurrentTenant((tx) =>
      Promise.all([tx.auditEvent.groupBy({ by: ['outcome'], _count: { _all: true } }), tx.auditEvent.count()]),
    );
    const byOutcome = Object.fromEntries(Object.values(AuditOutcome).map((o) => [o, 0])) as Record<AuditOutcome, number>;
    for (const row of rows) byOutcome[row.outcome] = row._count._all;
    return { total, byOutcome };
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
    const events = await this.prisma.forCurrentTenant((tx) => tx.auditEvent.findMany({ orderBy: { createdAt: 'asc' } }));

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
