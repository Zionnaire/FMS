import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { TenantContextService } from './tenant-context.service';

/**
 * Global so every feature module gets `PrismaService` and `TenantContextService` without
 * re-importing this module everywhere — matches how architecture.md treats
 * `infrastructure/database` as a cross-cutting concern, not a feature module.
 */
@Global()
@Module({
  providers: [PrismaService, TenantContextService],
  exports: [PrismaService, TenantContextService],
})
export class DatabaseModule {}
