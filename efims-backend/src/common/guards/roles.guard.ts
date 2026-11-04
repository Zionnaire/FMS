import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { Request } from 'express';
import { AuditService } from '../../modules/audit/audit.service';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthenticatedUser } from '../types/authenticated-user.interface';

/**
 * Coarse role check for `@Roles(...)`-decorated routes. Runs after `JwtAuthGuard`, so
 * `request.user` is already populated. A denial here is written to the audit log — per
 * CLAUDE.md non-negotiable #6, "any denial is itself written as an audit event" isn't scoped
 * only to case access, so this guard follows the same rule for role-gated routes.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;
    const permitted = !!user && requiredRoles.includes(user.role);

    if (!permitted && user) {
      await this.auditService.record({
        tenantId: user.tenantId,
        actorUserId: user.sub,
        action: 'authz.role_check',
        entityType: context.getClass().name,
        outcome: 'DENIED',
        metadata: {
          requiredRoles,
          actualRole: user.role,
          route: `${request.method} ${request.originalUrl ?? request.url}`,
        },
      });
    }

    return permitted;
  }
}
