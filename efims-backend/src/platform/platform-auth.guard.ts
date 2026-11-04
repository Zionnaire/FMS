import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

export interface PlatformTokenPayload {
  sub: string;
  email: string;
  scope: 'platform';
}

/**
 * Platform-layer equivalent of `JwtAuthGuard` — verifies a platform-scoped access token (signed
 * with its own secret, `PLATFORM_JWT_SECRET`, never the tenant `JWT_ACCESS_SECRET`) and attaches
 * the payload to `request.platformUser`, never `request.user`. Deliberately NOT the global
 * `JwtAuthGuard`: every `/platform/*` route is marked `@Public()` (so the globally-registered
 * `JwtAuthGuard` — which only knows how to verify tenant tokens — lets it through untouched) and
 * then opts back into this guard explicitly via `@UseGuards(PlatformAuthGuard)`. Two separate
 * guards checking two separately-signed token shapes is what makes "a bug in the per-tenant RBAC
 * system cannot grant cross-tenant power" true structurally, not just by convention — see
 * `PlatformUser`'s own doc comment in schema.prisma.
 */
@Injectable()
export class PlatformAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = extractBearerToken(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    try {
      const payload = await this.jwtService.verifyAsync<PlatformTokenPayload>(token, {
        secret: this.configService.getOrThrow<string>('PLATFORM_JWT_SECRET'),
      });
      if (payload.scope !== 'platform') {
        throw new Error('not a platform token');
      }
      (request as Request & { platformUser: PlatformTokenPayload }).platformUser = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired platform access token');
    }
  }
}

function extractBearerToken(header: string | undefined): string | undefined {
  if (!header) {
    return undefined;
  }
  const [scheme, token] = header.split(' ');
  return scheme === 'Bearer' && token ? token : undefined;
}
