import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuditOutcome, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomBytes, createHash } from 'node:crypto';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user.interface';
import { AuditService } from '../audit/audit.service';
import { LoginDto } from './dto/login.dto';

interface RefreshTokenPayload {
  sub: string;
  tenantId: string;
  jti: string;
  ts: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

/** Same vague message for "tenant doesn't exist", "user doesn't exist", and "wrong password" —
 * distinguishing them in the response would let an attacker enumerate valid tenant slugs and
 * email addresses. The real reason is always in the audit event (when we have a tenant to
 * attribute it to) and the server log, never in the HTTP response. */
const INVALID_CREDENTIALS = 'Invalid credentials';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
  ) {}

  async login(dto: LoginDto): Promise<AuthTokens & { user: PublicUser }> {
    // Tenant lookup is the one identity-module query that is deliberately NOT tenant-scoped —
    // there is no tenant to scope it to yet. `tenants` has no RLS policy at all (control
    // plane, docs/architecture.md §4.2), so a plain `this.prisma.tenant.findUnique` is correct
    // here and is the only place in this module that touches Prisma outside
    // withTenant/forCurrentTenant.
    const tenant = await this.prisma.tenant.findUnique({ where: { slug: dto.tenantSlug } });
    if (!tenant) {
      // No tenantId to attribute this to — can't write an audit event (every AuditEvent row
      // needs a tenant to be visible under RLS at all). Logged at the infrastructure level
      // (rate-limiting / brute-force detection on the login endpoint) instead, not here.
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const user = await this.prisma.withTenant(tenant.id, (tx) =>
      tx.user.findUnique({ where: { tenantId_email: { tenantId: tenant.id, email: dto.email } } }),
    );

    if (!user || user.status !== UserStatus.ACTIVE) {
      await this.auditService.record({
        tenantId: tenant.id,
        action: 'auth.login',
        entityType: 'User',
        entityId: user?.id,
        outcome: AuditOutcome.DENIED,
        metadata: { email: dto.email, reason: user ? 'user_not_active' : 'user_not_found' },
      });
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const passwordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!passwordValid) {
      await this.auditService.record({
        tenantId: tenant.id,
        actorUserId: user.id,
        action: 'auth.login',
        entityType: 'User',
        entityId: user.id,
        outcome: AuditOutcome.DENIED,
        metadata: { email: dto.email, reason: 'bad_password' },
      });
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    await this.auditService.record({
      tenantId: tenant.id,
      actorUserId: user.id,
      action: 'auth.login',
      entityType: 'User',
      entityId: user.id,
      outcome: AuditOutcome.SUCCESS,
    });

    const tokens = await this.issueTokenPair({
      sub: user.id,
      tenantId: tenant.id,
      email: user.email,
      role: user.role,
      clearanceLevel: user.clearanceLevel,
    });

    return { ...tokens, user: toPublicUser(user) };
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(refreshToken, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const { tenantId, jti, sub: userId, ts } = payload;

    const row = await this.prisma.withTenant(tenantId, (tx) =>
      tx.refreshToken.findUnique({ where: { id: jti } }),
    );

    const tokenSecretHash = sha256(ts);
    const rowMatches = row && row.tokenHash === tokenSecretHash;

    if (!row || !rowMatches) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (row.revokedAt || row.expiresAt < new Date()) {
      // The JWT signature and expiry were valid, but the DB row says otherwise — either it
      // expired server-side ahead of the JWT (shouldn't normally happen, TTLs should match) or,
      // more importantly, this exact refresh token was already used once and rotated out. That
      // second case is a replay of a stolen/leaked token: treat it as a security incident, not
      // a routine expiry, and revoke every other active refresh token for this user too.
      await this.revokeAllRefreshTokensForUser(tenantId, userId);
      await this.auditService.record({
        tenantId,
        actorUserId: userId,
        action: 'auth.refresh',
        entityType: 'RefreshToken',
        entityId: row.id,
        outcome: AuditOutcome.DENIED,
        metadata: { reason: row.revokedAt ? 'reuse_of_revoked_token' : 'expired' },
      });
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.prisma.withTenant(tenantId, (tx) => tx.user.findUnique({ where: { id: userId } }));
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Rotate: revoke the token just used, issue a brand new pair. Never hand back the same
    // refresh token twice.
    await this.prisma.withTenant(tenantId, (tx) =>
      tx.refreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } }),
    );

    return this.issueTokenPair({
      sub: user.id,
      tenantId,
      email: user.email,
      role: user.role,
      clearanceLevel: user.clearanceLevel,
    });
  }

  async logout(refreshToken: string): Promise<void> {
    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(refreshToken, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      // Logging out with an already-invalid token isn't an error the caller needs to see —
      // there's nothing left to revoke either way.
      return;
    }

    await this.prisma.withTenant(payload.tenantId, (tx) =>
      tx.refreshToken.updateMany({
        where: { id: payload.jti, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    );

    await this.auditService.record({
      tenantId: payload.tenantId,
      actorUserId: payload.sub,
      action: 'auth.logout',
      entityType: 'RefreshToken',
      entityId: payload.jti,
      outcome: AuditOutcome.SUCCESS,
    });
  }

  private async revokeAllRefreshTokensForUser(tenantId: string, userId: string): Promise<void> {
    await this.prisma.withTenant(tenantId, (tx) =>
      tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    );
  }

  private async issueTokenPair(claims: Omit<AuthenticatedUser, never>): Promise<AuthTokens> {
    const accessToken = await this.jwtService.signAsync(claims, {
      secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.configService.get<string>('JWT_ACCESS_TTL', '15m'),
    });

    const refreshTtl = this.configService.get<string>('JWT_REFRESH_TTL', '7d');
    const expiresAt = new Date(Date.now() + parseDurationMs(refreshTtl));

    const row = await this.prisma.withTenant(claims.tenantId, (tx) =>
      tx.refreshToken.create({
        data: { tenantId: claims.tenantId, userId: claims.sub, tokenHash: '', expiresAt },
      }),
    );

    const tokenSecret = randomBytes(32).toString('base64url');
    await this.prisma.withTenant(claims.tenantId, (tx) =>
      tx.refreshToken.update({ where: { id: row.id }, data: { tokenHash: sha256(tokenSecret) } }),
    );

    const refreshPayload: RefreshTokenPayload = {
      sub: claims.sub,
      tenantId: claims.tenantId,
      jti: row.id,
      ts: tokenSecret,
    };
    const refreshToken = await this.jwtService.signAsync(refreshPayload, {
      secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: refreshTtl,
    });

    return { accessToken, refreshToken };
  }
}

export interface PublicUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  clearanceLevel: number;
}

function toPublicUser(user: {
  id: string;
  email: string;
  fullName: string;
  role: string;
  clearanceLevel: number;
}): PublicUser {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    clearanceLevel: user.clearanceLevel,
  };
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Parses the small subset of Prisma/jsonwebtoken-style duration strings this module actually
 * uses (`"15m"`, `"7d"`, `"1h"`) — not a general-purpose duration parser. */
function parseDurationMs(duration: string): number {
  const match = /^(\d+)(ms|s|m|h|d)$/.exec(duration.trim());
  if (!match) {
    throw new Error(`Unsupported duration format: "${duration}" (expected e.g. "15m", "7d")`);
  }
  const value = Number(match[1]);
  const unitMs: Record<string, number> = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return value * unitMs[match[2]];
}
