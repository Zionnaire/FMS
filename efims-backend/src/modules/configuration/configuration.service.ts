import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AuditOutcome, CdKey, ConfigurationEntry, ConfigurationStatus, Prisma } from '@prisma/client';
import type { Cache } from 'cache-manager';
import { PrismaService, TenantScopedClient } from '../../infrastructure/database/prisma.service';
import { TenantContextService } from '../../infrastructure/database/tenant-context.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user.interface';
import { AuditService } from '../audit/audit.service';
import { CreateConfigurationVersionDto } from './dto/create-configuration-version.dto';
import { RatifyConfigurationVersionDto } from './dto/ratify-configuration-version.dto';
import { validateCdValue } from './types/cd-value.validators';

/** Read-heavy (every incident create, every triage assessment, every approval decision reads
 * CD-01/02/03/04 territory) and rarely-changing (a new version only appears via an explicit
 * `createDraft`/`ratify` call, not on some external schedule) — exactly the profile this
 * project's own cross-cutting-infrastructure decision named as the first real caching target.
 * Short TTL, not because staleness is dangerous here (unlike caching a compartment/team-
 * membership access check, which this codebase deliberately does NOT cache — see
 * `CasesService`/`IncidentsService`'s own access-check methods), but because a ratified config
 * change should still become visible within a few seconds, not linger for the full 30s app-wide
 * default. */
const CONFIG_CACHE_TTL_MS = 5000;

/**
 * Owns every read and write of `ConfigurationEntry` — per CLAUDE.md non-negotiable #2, no
 * other module may query this table directly once `triage`/`cases`/etc. exist; they call
 * `getCurrent(key)` here instead. That boundary doesn't have anything to enforce it yet (there
 * are no other modules), but the method shape is deliberately "here's the current value for a
 * key", not "here's a Prisma delegate", so it can't accidentally be bypassed later either.
 */
@Injectable()
export class ConfigurationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly tenantContext: TenantContextService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  /**
   * The value every other module should treat as "the current CD-0X setting": the highest-
   * version RATIFIED row whose effectiveDate has passed, falling back to the highest-version
   * DRAFT if nothing has been ratified yet. That fallback exists because CLAUDE.md non-
   * negotiable #9 treats every CD value as a *working default* until ratified — the system has
   * to run on something in the meantime, and refusing to operate until Governance/Risk/Legal
   * formally sign off isn't a reasonable MVP posture.
   */
  async getCurrent(key: CdKey): Promise<ConfigurationEntry | null> {
    const cacheKey = this.cacheKey(key);
    const cached = await this.cache.get<ConfigurationEntry | null>(cacheKey);
    if (cached !== undefined) {
      return cached;
    }
    const entry = await this.prisma.forCurrentTenant((tx) => this.resolveCurrent(tx, key));
    await this.cache.set(cacheKey, entry, CONFIG_CACHE_TTL_MS);
    return entry;
  }

  private cacheKey(key: CdKey): string {
    // Tenant-scoped, deliberately — the in-memory cache is process-wide, not per-request, so a
    // key without the tenant id would leak one tenant's config into another's cache hit.
    return `configuration:${this.tenantContext.getTenantId()}:${key}`;
  }

  /**
   * All 8 CD values from one atomic snapshot, in one transaction — NOT 8 independent
   * `getCurrent()` calls fanned out via `Promise.all`, which is what this looked like
   * originally. That version passed static verification and local testing fine, but firing 8
   * concurrent `$transaction`s against a real remote database (Neon, in this project's actual
   * dev setup) blew past Prisma's default transaction-acquisition wait and threw
   * "Unable to start a transaction in the given time" — a connection-pool contention failure
   * only a real network round-trip surfaces, never a local Postgres instance or a type-checker.
   * One transaction sequentially reading all 8 keys is both the fix and, incidentally, more
   * correct: a genuinely consistent snapshot instead of 8 independently-committed reads that
   * could in principle straddle a concurrent ratify.
   */
  async getAllCurrent(): Promise<Partial<Record<CdKey, ConfigurationEntry>>> {
    return this.prisma.forCurrentTenant(async (tx) => {
      const result: Partial<Record<CdKey, ConfigurationEntry>> = {};
      for (const key of Object.values(CdKey)) {
        const entry = await this.resolveCurrent(tx, key);
        if (entry) {
          result[key] = entry;
        }
      }
      return result;
    });
  }

  private async resolveCurrent(tx: TenantScopedClient, key: CdKey): Promise<ConfigurationEntry | null> {
    const ratified = await tx.configurationEntry.findFirst({
      where: { key, status: ConfigurationStatus.RATIFIED, effectiveDate: { lte: new Date() } },
      orderBy: { version: 'desc' },
    });
    if (ratified) {
      return ratified;
    }
    return tx.configurationEntry.findFirst({
      where: { key, status: ConfigurationStatus.DRAFT },
      orderBy: { version: 'desc' },
    });
  }

  async getHistory(key: CdKey): Promise<ConfigurationEntry[]> {
    return this.prisma.forCurrentTenant((tx) =>
      tx.configurationEntry.findMany({ where: { key }, orderBy: { version: 'desc' } }),
    );
  }

  async createDraft(
    actor: AuthenticatedUser,
    key: CdKey,
    dto: CreateConfigurationVersionDto,
  ): Promise<ConfigurationEntry> {
    validateCdValue(key, dto.value);

    try {
      const created = await this.prisma.forCurrentTenant(async (tx) => {
        const latest = await tx.configurationEntry.findFirst({
          where: { key },
          orderBy: { version: 'desc' },
          select: { version: true },
        });
        const nextVersion = (latest?.version ?? 0) + 1;

        const created = await tx.configurationEntry.create({
          data: {
            tenantId: actor.tenantId,
            key,
            version: nextVersion,
            value: dto.value as Prisma.InputJsonValue,
            notes: dto.notes,
            createdBy: actor.sub,
          },
        });

        await this.auditService.record({
          tenantId: actor.tenantId,
          actorUserId: actor.sub,
          action: 'configuration.draft.create',
          entityType: 'ConfigurationEntry',
          entityId: created.id,
          outcome: AuditOutcome.SUCCESS,
          metadata: { key, version: nextVersion },
        });

        return created;
      });
      // A fresh draft can change what getCurrent() falls back to when nothing's ratified yet
      // (the highest-version DRAFT) — invalidate even though this isn't a ratify.
      await this.cache.del(this.cacheKey(key));
      return created;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Two concurrent drafts computed the same next version — the unique constraint on
        // (tenantId, key, version) caught it. Rare in practice (configuration changes are not
        // a high-concurrency operation), but the honest response is "retry", not a 500.
        throw new ConflictException(
          'Another draft was created for this key at the same time — retry the request',
        );
      }
      throw err;
    }
  }

  /** Ratifying supersedes whatever was previously RATIFIED for this key (there is only ever one
   * "current ratified" row at a time — see the invariant note on ConfigurationEntry in
   * schema.prisma) and marks `version` as the new one, with an audit trail of who and when. */
  async ratify(
    actor: AuthenticatedUser,
    key: CdKey,
    version: number,
    dto: RatifyConfigurationVersionDto,
  ): Promise<ConfigurationEntry> {
    const effectiveDate = dto.effectiveDate ? new Date(dto.effectiveDate) : new Date();

    const ratified = await this.prisma.forCurrentTenant(async (tx) => {
      const target = await tx.configurationEntry.findUnique({
        where: { tenantId_key_version: { tenantId: actor.tenantId, key, version } },
      });
      if (!target) {
        throw new NotFoundException(`No ${key} version ${version} exists for this tenant`);
      }
      if (target.status !== ConfigurationStatus.DRAFT) {
        throw new BadRequestException(
          `${key} version ${version} is already ${target.status.toLowerCase()} — only a DRAFT can be ratified`,
        );
      }

      await tx.configurationEntry.updateMany({
        where: { tenantId: actor.tenantId, key, status: ConfigurationStatus.RATIFIED },
        data: { status: ConfigurationStatus.SUPERSEDED },
      });

      const ratified = await tx.configurationEntry.update({
        where: { id: target.id },
        data: {
          status: ConfigurationStatus.RATIFIED,
          ratifiedBy: actor.sub,
          ratifiedAt: new Date(),
          effectiveDate,
          notes: dto.notes ?? target.notes,
        },
      });

      await this.auditService.record({
        tenantId: actor.tenantId,
        actorUserId: actor.sub,
        action: 'configuration.ratify',
        entityType: 'ConfigurationEntry',
        entityId: ratified.id,
        outcome: AuditOutcome.SUCCESS,
        metadata: { key, version, effectiveDate },
      });

      return ratified;
    });
    await this.cache.del(this.cacheKey(key));
    return ratified;
  }
}
