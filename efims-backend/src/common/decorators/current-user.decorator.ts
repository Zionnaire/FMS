import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedUser } from '../types/authenticated-user.interface';

/** Pulls the decoded JWT payload `JwtAuthGuard` attached to the request. Only valid on routes
 * that aren't `@Public()` — on a public route there is no `request.user` to return. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
