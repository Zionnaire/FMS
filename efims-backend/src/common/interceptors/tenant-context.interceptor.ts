import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { TenantContextService } from '../../infrastructure/database/tenant-context.service';
import { AuthenticatedUser } from '../types/authenticated-user.interface';

/**
 * Bridges `request.user.tenantId` (set by `JwtAuthGuard`) into `TenantContextService`'s
 * AsyncLocalStorage for the rest of the request's async call chain, so any service can later
 * call `prisma.forCurrentTenant(...)` without the tenant id being passed down through every
 * function signature.
 *
 * Registered globally in AppModule. On a `@Public()` route there's no `request.user`, so
 * nothing is set — those routes (login, refresh) must resolve their own tenant explicitly and
 * use `prisma.withTenant(tenantId, ...)` instead.
 *
 * Runs as an interceptor, not a guard, specifically so it can wrap the *entire* downstream
 * pipeline (remaining guards, the handler, and everything the handler awaits) in one
 * `AsyncLocalStorage.run()` call — a guard only gets to run before the handler, which isn't
 * enough: `run()`'s callback has to contain the whole async chain that might read the tenant.
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(private readonly tenantContext: TenantContextService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const tenantId = request.user?.tenantId;

    if (!tenantId) {
      return next.handle();
    }

    return this.tenantContext.run(tenantId, () => next.handle());
  }
}
