import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

interface TenantStore {
  tenantId: string;
}

/**
 * Carries the current request's tenant id through async call chains without needing to thread
 * it through every function signature. Populated once per request by
 * `TenantContextInterceptor` (from the JWT payload `JwtAuthGuard` already verified), read by
 * `PrismaService.forCurrentTenant()`.
 *
 * Safe as a singleton: `AsyncLocalStorage` scopes its store to the async execution context of
 * whoever called `run()`, which is exactly "this one request" in a Nest/Express handler chain —
 * no request-scoped provider (and its DI-subtree-per-request cost) is needed.
 */
@Injectable()
export class TenantContextService {
  private readonly storage = new AsyncLocalStorage<TenantStore>();

  run<T>(tenantId: string, fn: () => T): T {
    return this.storage.run({ tenantId }, fn);
  }

  getTenantId(): string | undefined {
    return this.storage.getStore()?.tenantId;
  }
}
