import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuditOutcome, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomBytes, createHash } from 'node:crypto';
import { OTP } from 'otplib';
import * as QRCode from 'qrcode';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user.interface';
import { AuditService } from '../audit/audit.service';
import { LoginDto } from './dto/login.dto';

/** The vendor name shown inside an authenticator app (Google Authenticator, Authy, etc.) next to
 * the account entry — purely cosmetic, not a secret. */
const MFA_ISSUER = 'EFIMS';
const MFA_CHALLENGE_TTL = '5m';
const MFA_BACKUP_CODE_COUNT = 10;
/** One shared instance — stateless per RFC 6238, `secret`/`token` are passed per call, nothing
 * here is request-specific. `epochTolerance: 30` accepts a code from one period (30s) either
 * side of "now", the standard allowance for ordinary client/server clock drift. */
const totp = new OTP({ strategy: 'totp' });
const TOTP_EPOCH_TOLERANCE = 30;

export type LoginResult = (AuthTokens & { user: PublicUser; mfaRequired?: false }) | { mfaRequired: true; mfaChallengeToken: string };

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

  async login(dto: LoginDto): Promise<LoginResult> {
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

    // Password is correct. A user who has enrolled MFA (opt-in, see the schema's own doc
    // comment on `User.mfaEnabled` — never forced) doesn't get real tokens here: a short-lived
    // challenge token stands in until `verifyMfaAndLogin` confirms the second factor too.
    if (user.mfaEnabled) {
      await this.auditService.record({
        tenantId: tenant.id,
        actorUserId: user.id,
        action: 'auth.login.mfa_challenge_issued',
        entityType: 'User',
        entityId: user.id,
        outcome: AuditOutcome.SUCCESS,
      });
      const mfaChallengeToken = await this.jwtService.signAsync(
        { sub: user.id, tenantId: tenant.id },
        { secret: this.configService.getOrThrow<string>('JWT_MFA_CHALLENGE_SECRET'), expiresIn: MFA_CHALLENGE_TTL },
      );
      return { mfaRequired: true, mfaChallengeToken };
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

  /** Second step of a login for an MFA-enrolled user. The challenge token proves the password
   * step already succeeded (signed with its own dedicated secret, never `JWT_ACCESS_SECRET` —
   * a leaked/forged access-token signature must never be usable to mint a challenge, and vice
   * versa, same "separate secrets for separate token kinds" discipline as the platform layer's
   * own JWT). Accepts either a live TOTP code or an unused backup code — tries TOTP first since
   * that's the common case, falls back to backup-code matching (hash, compare, consume on
   * match) only if TOTP fails. */
  async verifyMfaAndLogin(mfaChallengeToken: string, code: string): Promise<AuthTokens & { user: PublicUser }> {
    let payload: { sub: string; tenantId: string };
    try {
      payload = await this.jwtService.verifyAsync(mfaChallengeToken, {
        secret: this.configService.getOrThrow<string>('JWT_MFA_CHALLENGE_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired MFA challenge — log in again');
    }

    const user = await this.prisma.withTenant(payload.tenantId, (tx) => tx.user.findUnique({ where: { id: payload.sub } }));
    if (!user || user.status !== UserStatus.ACTIVE || !user.mfaEnabled || !user.mfaSecret) {
      throw new UnauthorizedException('Invalid or expired MFA challenge — log in again');
    }

    // `totp.verify` throws (rather than returning `{valid: false}`) for a token that isn't
    // exactly 6 digits — a real, live-found bug: a backup code (9 chars, "A1B2-C3D4") crashed
    // this with a 500 instead of falling through to backup-code matching below. Only a 6-digit
    // input is a plausible TOTP code at all, so anything else skips straight to backup-code
    // matching without ever calling `totp.verify`.
    const totpValid = /^\d{6}$/.test(code)
      ? (await totp.verify({ secret: user.mfaSecret, token: code, epochTolerance: TOTP_EPOCH_TOLERANCE })).valid
      : false;
    let usedBackupCode = false;
    if (!totpValid) {
      const codeHash = sha256(code.trim().toUpperCase());
      usedBackupCode = user.mfaBackupCodeHashes.includes(codeHash);
      if (usedBackupCode) {
        await this.prisma.withTenant(payload.tenantId, (tx) =>
          tx.user.update({
            where: { id: user.id },
            data: { mfaBackupCodeHashes: user.mfaBackupCodeHashes.filter((h) => h !== codeHash) },
          }),
        );
      }
    }

    if (!totpValid && !usedBackupCode) {
      await this.auditService.record({
        tenantId: payload.tenantId,
        actorUserId: user.id,
        action: 'auth.mfa.verify',
        entityType: 'User',
        entityId: user.id,
        outcome: AuditOutcome.DENIED,
        metadata: { reason: 'bad_code' },
      });
      throw new UnauthorizedException('Invalid verification code');
    }

    await this.auditService.record({
      tenantId: payload.tenantId,
      actorUserId: user.id,
      action: 'auth.mfa.verify',
      entityType: 'User',
      entityId: user.id,
      outcome: AuditOutcome.SUCCESS,
      metadata: usedBackupCode ? { usedBackupCode: true, remainingBackupCodes: user.mfaBackupCodeHashes.length - 1 } : undefined,
    });

    const tokens = await this.issueTokenPair({
      sub: user.id,
      tenantId: payload.tenantId,
      email: user.email,
      role: user.role,
      clearanceLevel: user.clearanceLevel,
    });
    return { ...tokens, user: toPublicUser(user) };
  }

  async getMfaStatus(actor: AuthenticatedUser): Promise<{ enabled: boolean; enrolledAt: Date | null }> {
    const user = await this.prisma.withTenant(actor.tenantId, (tx) => tx.user.findUnique({ where: { id: actor.sub } }));
    if (!user) {
      throw new UnauthorizedException();
    }
    return { enabled: user.mfaEnabled, enrolledAt: user.mfaEnrolledAt };
  }

  /** Step 1 of enrollment — generates a new secret and persists it with `mfaEnabled` still
   * `false` (a "pending" secret an attacker who merely reads the DB can't use for anything: it
   * only becomes live once `confirmMfaEnrollment` proves the real user actually captured it by
   * entering a code it produces). Re-callable at any time before confirming — each call
   * overwrites whatever pending secret existed before, so an abandoned enrollment attempt never
   * lingers as a second valid secret once a later one is confirmed. Refuses to run if MFA is
   * already enabled — disable first to re-enroll, rather than silently swapping the secret out
   * from under an active enrollment. */
  async startMfaEnrollment(actor: AuthenticatedUser): Promise<{ secret: string; otpauthUrl: string; qrCodeDataUrl: string }> {
    const user = await this.prisma.withTenant(actor.tenantId, (tx) => tx.user.findUnique({ where: { id: actor.sub } }));
    if (!user) {
      throw new UnauthorizedException();
    }
    if (user.mfaEnabled) {
      throw new BadRequestException('MFA is already enabled for this account — disable it before re-enrolling');
    }

    const secret = totp.generateSecret();
    const otpauthUrl = totp.generateURI({ issuer: MFA_ISSUER, label: user.email, secret });
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

    await this.prisma.withTenant(actor.tenantId, (tx) => tx.user.update({ where: { id: user.id }, data: { mfaSecret: secret } }));

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: user.id,
      action: 'auth.mfa.enroll_start',
      entityType: 'User',
      entityId: user.id,
      outcome: AuditOutcome.SUCCESS,
    });

    return { secret, otpauthUrl, qrCodeDataUrl };
  }

  /** Step 2 — proves the user's authenticator app actually has the secret `startMfaEnrollment`
   * just generated before MFA goes live. Generates and returns backup/recovery codes exactly
   * once: only their sha256 hashes are ever persisted (same "show a real secret once, store it
   * unrecoverable afterward" discipline as `issueTokenPair`'s refresh-token secret), so a caller
   * that loses this response has to disable and re-enroll, not call this again to see them. */
  async confirmMfaEnrollment(actor: AuthenticatedUser, code: string): Promise<{ backupCodes: string[] }> {
    const user = await this.prisma.withTenant(actor.tenantId, (tx) => tx.user.findUnique({ where: { id: actor.sub } }));
    if (!user) {
      throw new UnauthorizedException();
    }
    if (user.mfaEnabled) {
      throw new BadRequestException('MFA is already enabled for this account');
    }
    if (!user.mfaSecret) {
      throw new BadRequestException('Start enrollment first — no pending MFA secret for this account');
    }

    const confirmResult = await totp.verify({ secret: user.mfaSecret, token: code, epochTolerance: TOTP_EPOCH_TOLERANCE });
    if (!confirmResult.valid) {
      await this.auditService.record({
        tenantId: actor.tenantId,
        actorUserId: user.id,
        action: 'auth.mfa.enroll_confirm',
        entityType: 'User',
        entityId: user.id,
        outcome: AuditOutcome.DENIED,
        metadata: { reason: 'bad_code' },
      });
      throw new BadRequestException('Invalid verification code — check your authenticator app and try again');
    }

    const backupCodes = Array.from({ length: MFA_BACKUP_CODE_COUNT }, generateBackupCode);
    const backupCodeHashes = backupCodes.map((c) => sha256(c));

    await this.prisma.withTenant(actor.tenantId, (tx) =>
      tx.user.update({
        where: { id: user.id },
        data: { mfaEnabled: true, mfaEnrolledAt: new Date(), mfaBackupCodeHashes: backupCodeHashes },
      }),
    );

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: user.id,
      action: 'auth.mfa.enroll_confirm',
      entityType: 'User',
      entityId: user.id,
      outcome: AuditOutcome.SUCCESS,
    });

    return { backupCodes };
  }

  /** Requires re-entering the password (see `DisableMfaDto`'s own doc comment) — a live session
   * alone isn't enough to turn this off. */
  async disableMfa(actor: AuthenticatedUser, password: string): Promise<void> {
    const user = await this.prisma.withTenant(actor.tenantId, (tx) => tx.user.findUnique({ where: { id: actor.sub } }));
    if (!user) {
      throw new UnauthorizedException();
    }

    const passwordValid = await argon2.verify(user.passwordHash, password);
    if (!passwordValid) {
      await this.auditService.record({
        tenantId: actor.tenantId,
        actorUserId: user.id,
        action: 'auth.mfa.disable',
        entityType: 'User',
        entityId: user.id,
        outcome: AuditOutcome.DENIED,
        metadata: { reason: 'bad_password' },
      });
      throw new ForbiddenException('Incorrect password');
    }

    await this.prisma.withTenant(actor.tenantId, (tx) =>
      tx.user.update({
        where: { id: user.id },
        data: { mfaEnabled: false, mfaSecret: null, mfaBackupCodeHashes: [], mfaEnrolledAt: null },
      }),
    );

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: user.id,
      action: 'auth.mfa.disable',
      entityType: 'User',
      entityId: user.id,
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

/** One MFA backup/recovery code — human-typeable (uppercase hex in two dash-separated groups,
 * e.g. "A1B2-C3D4"), matched case-insensitively (`verifyMfaAndLogin` uppercases before hashing).
 * Hashed with the same plain `sha256` every other short-lived opaque secret in this file uses
 * (refresh-token secrets) — a backup code is single-use and revoked the moment it's consumed,
 * so it doesn't need `argon2`'s deliberately-slow KDF the way a long-lived password does. */
function generateBackupCode(): string {
  const bytes = randomBytes(4).toString('hex').toUpperCase();
  return `${bytes.slice(0, 4)}-${bytes.slice(4, 8)}`;
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
