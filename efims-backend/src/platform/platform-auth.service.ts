import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { PlatformLoginDto } from './dto/platform-login.dto';
import { PlatformTokenPayload } from './platform-auth.guard';

const INVALID_CREDENTIALS = 'Invalid credentials';

export interface PublicPlatformUser {
  id: string;
  email: string;
  fullName: string;
}

/**
 * Owns platform-level login. No refresh-token rotation (unlike tenant `AuthService`) — a
 * deliberate scope reduction, not an oversight: this is a small internal ops surface (list/create/
 * suspend tenants), not a high-traffic session a user lives in all day, so a single ~1h access
 * token that requires a fresh login afterward is an acceptable trade for not building a second
 * full refresh-token-rotation-with-reuse-detection system (`RefreshToken` is tenant-scoped and
 * FK'd to a tenant `User` — `PlatformUser` has no tenant to hang one off of, so even reusing that
 * table isn't a clean fit). Revisit if a platform session ever needs to outlive an hour in
 * practice.
 *
 * `platformUser.findUnique`/`findMany` run directly on `this.prisma` with no
 * `withTenant`/`forCurrentTenant` wrapper — correct, not an oversight: `platform_users`, like
 * `tenants`, is control-plane and carries no `tenantId` column at all (see that model's own doc
 * comment in schema.prisma), so there is no tenant context to set in the first place.
 */
@Injectable()
export class PlatformAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(dto: PlatformLoginDto): Promise<{ accessToken: string; user: PublicPlatformUser }> {
    const user = await this.prisma.platformUser.findUnique({ where: { email: dto.email } });
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const passwordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!passwordValid) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const payload: PlatformTokenPayload = { sub: user.id, email: user.email, scope: 'platform' };
    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>('PLATFORM_JWT_SECRET'),
      expiresIn: this.configService.get<string>('PLATFORM_JWT_TTL', '1h'),
    });

    return { accessToken, user: { id: user.id, email: user.email, fullName: user.fullName } };
  }
}
