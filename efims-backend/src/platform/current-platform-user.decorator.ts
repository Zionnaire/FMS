import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { PlatformTokenPayload } from './platform-auth.guard';

/** Pulls the decoded platform-token payload `PlatformAuthGuard` attached to the request — the
 * platform-layer equivalent of `CurrentUser`. Only valid on routes guarded by
 * `PlatformAuthGuard`. */
export const CurrentPlatformUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): PlatformTokenPayload => {
  const request = ctx.switchToHttp().getRequest();
  return request.platformUser;
});
