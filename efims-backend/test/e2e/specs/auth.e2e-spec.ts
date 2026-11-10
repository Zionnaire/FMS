import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { createTestApp, TestApp } from '../helpers/app';
import { bootstrapTenant, TestTenant } from '../helpers/fixtures';

describe('Authentication and session security', () => {
  let testApp: TestApp;
  let tenant: TestTenant;

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  beforeAll(async () => {
    testApp = await createTestApp();
    tenant = await bootstrapTenant(testApp.http, 'e2e-auth', 'E2E Auth Tenant');
  }, 400000);

  afterAll(async () => {
    await testApp.close();
  });

  describe('refresh token rotation and reuse detection', () => {
    it('rotates on refresh: the old refresh token can never be used again', async () => {
      const loginRes = await testApp.http.post('/auth/login').send({ tenantSlug: tenant.slug, email: tenant.admin1.email, password: tenant.admin1.password });
      const originalRefreshToken = loginRes.body.refreshToken;

      const refreshRes = await testApp.http.post('/auth/refresh').send({ refreshToken: originalRefreshToken });
      expect(refreshRes.status).toBe(201);
      expect(refreshRes.body.refreshToken).not.toBe(originalRefreshToken);

      const reuseRes = await testApp.http.post('/auth/refresh').send({ refreshToken: originalRefreshToken });
      expect(reuseRes.status).toBe(401);
    });

    it('reusing an already-rotated refresh token revokes every other active refresh token for that user', async () => {
      const loginRes = await testApp.http.post('/auth/login').send({ tenantSlug: tenant.slug, email: tenant.admin1.email, password: tenant.admin1.password });
      const firstToken = loginRes.body.refreshToken;

      const rotatedRes = await testApp.http.post('/auth/refresh').send({ refreshToken: firstToken });
      const rotatedToken = rotatedRes.body.refreshToken;

      // Replay the already-used (revoked) first token — this should be treated as a stolen-token
      // signal and revoke every other active refresh token for this user, including the one
      // that was legitimately just rotated to.
      await testApp.http.post('/auth/refresh').send({ refreshToken: firstToken });

      const useRotatedAfterReplay = await testApp.http.post('/auth/refresh').send({ refreshToken: rotatedToken });
      expect(useRotatedAfterReplay.status).toBe(401);
    });
  });

  describe('expired and tampered tokens', () => {
    it('rejects an access token signed with the correct secret but an already-expired exp claim', async () => {
      const expiredToken = jwt.sign(
        { sub: tenant.admin1.id, tenantId: tenant.tenantId, email: tenant.admin1.email, role: 'ADMIN', clearanceLevel: 4 },
        process.env.JWT_ACCESS_SECRET!,
        { expiresIn: -10 },
      );
      const res = await testApp.http.get('/users/me').set(auth(expiredToken));
      expect(res.status).toBe(401);
    });

    it('rejects a tampered access token (valid shape, corrupted signature)', async () => {
      const loginRes = await testApp.http.post('/auth/login').send({ tenantSlug: tenant.slug, email: tenant.admin1.email, password: tenant.admin1.password });
      const validToken = loginRes.body.accessToken;
      const tampered = validToken.slice(0, -4) + (validToken.slice(-4) === 'aaaa' ? 'bbbb' : 'aaaa');

      const res = await testApp.http.get('/users/me').set(auth(tampered));
      expect(res.status).toBe(401);
    });

    it('rejects an access token signed with the WRONG secret entirely', async () => {
      const forged = jwt.sign(
        { sub: tenant.admin1.id, tenantId: tenant.tenantId, email: tenant.admin1.email, role: 'ADMIN', clearanceLevel: 4 },
        'not-the-real-secret',
        { expiresIn: '15m' },
      );
      const res = await testApp.http.get('/users/me').set(auth(forged));
      expect(res.status).toBe(401);
    });
  });

  describe('platform tokens and tenant tokens are never interchangeable', () => {
    let platformAccessToken: string;

    beforeAll(async () => {
      const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
      try {
        const email = 'platform-admin@e2e.test';
        const passwordHash = await argon2.hash('Platform-Test-123!');
        await prisma.platformUser.upsert({
          where: { email },
          update: {},
          create: { email, passwordHash, fullName: 'E2E Platform Admin', status: 'ACTIVE' },
        });
      } finally {
        await prisma.$disconnect();
      }

      const loginRes = await testApp.http.post('/platform/auth/login').send({ email: 'platform-admin@e2e.test', password: 'Platform-Test-123!' });
      expect(loginRes.status).toBe(201);
      platformAccessToken = loginRes.body.accessToken;
    });

    it('a platform-scoped token is rejected on a tenant route', async () => {
      const res = await testApp.http.get('/users/me').set(auth(platformAccessToken));
      expect(res.status).toBe(401);
    });

    it('a tenant-scoped token is rejected on a platform route', async () => {
      const res = await testApp.http.get('/platform/tenants').set(auth(tenant.admin1.accessToken));
      expect(res.status).toBe(401);
    });

    it('a tenant access token signed as if it were platform-scoped (forged scope claim, wrong secret) is still rejected', async () => {
      const forgedPlatformToken = jwt.sign(
        { sub: 'fake-platform-user-id', email: 'nobody@fake.test', scope: 'platform' },
        process.env.JWT_ACCESS_SECRET!, // the tenant secret, not PLATFORM_JWT_SECRET
        { expiresIn: '15m' },
      );
      const res = await testApp.http.get('/platform/tenants').set(auth(forgedPlatformToken));
      expect(res.status).toBe(401);
    });
  });

  // A genuinely separate Nest app instance (its own ThrottlerStorage, its own in-memory hit
  // counter) — every other describe block above also calls /auth/login (successfully) as part
  // of its own setup, and those hits would otherwise count toward the same 5-per-60s bucket this
  // block deliberately exhausts, causing a 429 to appear long before the 6th attempt here.
  describe('login brute-force throttling', () => {
    let throttleApp: TestApp;
    let throttleTenant: TestTenant;

    beforeAll(async () => {
      throttleApp = await createTestApp();
      throttleTenant = await bootstrapTenant(throttleApp.http, 'e2e-auth-throttle', 'E2E Auth Throttle Tenant');
    }, 400000);

    afterAll(async () => {
      await throttleApp.close();
    });

    it('blocks bad-password attempts once the throttle window is exhausted, 429, and stays blocked (not flapping back to 401)', async () => {
      // 8, not 6: bootstrapTenant() above already performed one successful login against this
      // same route+IP bucket, so the exact attempt number that first trips the limit shifts by
      // however many prior hits happened — assert the *shape* (401s, then a 429 that never
      // reverts), not a specific hardcoded position.
      const attempts: Awaited<ReturnType<typeof throttleApp.http.post>>[] = [];
      for (let i = 0; i < 8; i++) {
        attempts.push(
          await throttleApp.http
            .post('/auth/login')
            .send({ tenantSlug: throttleTenant.slug, email: throttleTenant.admin1.email, password: 'definitely-wrong-password' }),
        );
      }
      const statuses = attempts.map((r) => r.status);
      const firstThrottled = statuses.findIndex((s) => s === 429);

      expect(firstThrottled).toBeGreaterThan(-1);
      expect(statuses.slice(0, firstThrottled).every((s) => s === 401)).toBe(true);
      expect(statuses.slice(firstThrottled).every((s) => s === 429)).toBe(true);
    });
  });
});
