import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { TenantContextService } from './tenant-context.service';

/** The subset of the Prisma client usable inside a `withTenant`/`forCurrentTenant` callback —
 * excludes the connection-lifecycle and transaction-starting methods, since those don't make
 * sense (and in some cases don't work) nested inside a transaction that's already open. */
export type TenantScopedClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/**
 * Every tenant-scoped table has a Postgres RLS policy of the form
 * `"tenantId" = current_setting('app.current_tenant', true)` (see prisma/rls-policies.sql).
 * That session variable does not set itself — something has to run
 * `SELECT set_config('app.current_tenant', $1, true)` on the same connection before any
 * tenant-scoped query, every time. `withTenant` / `forCurrentTenant` are the only two places in
 * this codebase that do that. Never call `this.user`, `this.team`, etc. directly on
 * `PrismaService` outside of one of these two methods — an un-scoped connection doesn't see
 * "everything", it sees *nothing*, because every RLS policy here defaults to deny.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(private readonly tenantContext: TenantContextService) {
    super();
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Run `fn` inside a transaction pinned to one connection with `app.current_tenant` set to
   * `tenantId` for that connection's lifetime. Use this directly only for the pre-authentication
   * bootstrap case (login, where the tenant comes from the request body, not a JWT yet).
   * Everywhere else, use `forCurrentTenant`.
   *
   * `maxWait`/`timeout` are raised well past Prisma's defaults (2s / 5s) for every call through
   * here, project-wide — proven necessary live, not a defensive guess: against this project's
   * actual dev database (Neon, pooled over PgBouncer, real network round-trips instead of
   * localhost), the defaults caused two distinct failures under completely ordinary load —
   * "Unable to start a transaction in the given time" (maxWait too short to even acquire a
   * connection under light concurrency) and "Transaction ... old closed transaction" (timeout
   * expiring mid-transaction on a handful of sequential queries, e.g.
   * ConfigurationService.getAllCurrent's 8-key read). A local Postgres instance would never
   * have surfaced either — both are latency-driven, not a logic bug — which is exactly why this
   * lives at the one shared chokepoint every tenant-scoped call already goes through, rather
   * than patched into individual call sites as they're each discovered.
   */
  async withTenant<T>(tenantId: string, fn: (tx: TenantScopedClient) => Promise<T>): Promise<T> {
    return this.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.current_tenant', ${tenantId}, true)`;
        return fn(tx);
      },
      { maxWait: 10000, timeout: 20000 },
    );
  }

  /**
   * Same as `withTenant`, but reads the tenant id from `TenantContextService` (populated from
   * the authenticated JWT by `TenantContextInterceptor`) instead of taking it as a parameter.
   * This is what every authenticated service method should call.
   */
  async forCurrentTenant<T>(fn: (tx: TenantScopedClient) => Promise<T>): Promise<T> {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      // A bug, not a user-facing error: every authenticated route has a tenantId by the time it
      // reaches a service. If this throws, TenantContextInterceptor isn't wired on that route.
      this.logger.error('forCurrentTenant() called with no tenant in AsyncLocalStorage context');
      throw new Error('No tenant context available for this request');
    }
    return this.withTenant(tenantId, fn);
  }
}

export { Prisma };
