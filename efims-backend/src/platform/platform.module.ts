import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PlatformAuthController } from './platform-auth.controller';
import { PlatformAuthService } from './platform-auth.service';
import { PlatformAuthGuard } from './platform-auth.guard';
import { TenantsAdminController } from './tenants-admin.controller';
import { TenantsAdminService } from './tenants-admin.service';

/**
 * The super-admin/multi-tenant layer (added 2026-10-14) — sits beside every tenant module, never
 * imported by one and never importing one, matching `PlatformUser`'s own "structurally separate
 * from the per-tenant RBAC system" design (see that model's doc comment in schema.prisma). Its own
 * private `JwtModule` registration (a second one, independent of `IdentityModule`'s) is
 * deliberate: `PLATFORM_JWT_SECRET` must never be the same secret `JwtAuthGuard`/`AuthService` use
 * for tenant tokens, or a tenant-signed token and a platform-signed token could become
 * interchangeable by accident.
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('PLATFORM_JWT_SECRET'),
        signOptions: { expiresIn: config.get<string>('PLATFORM_JWT_TTL', '1h') },
      }),
    }),
  ],
  controllers: [PlatformAuthController, TenantsAdminController],
  providers: [PlatformAuthService, PlatformAuthGuard, TenantsAdminService],
})
export class PlatformModule {}
