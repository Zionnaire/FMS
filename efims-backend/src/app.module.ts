import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { TenantContextInterceptor } from './common/interceptors/tenant-context.interceptor';
import { DatabaseModule } from './infrastructure/database/database.module';
import { HealthModule } from './infrastructure/health/health.module';
import { RealtimeModule } from './infrastructure/realtime/realtime.module';
import { AuditModule } from './modules/audit/audit.module';
import { IdentityModule } from './modules/identity/identity.module';
import { ConfigurationModule } from './modules/configuration/configuration.module';
import { IncidentsModule } from './modules/incidents/incidents.module';
import { TriageModule } from './modules/triage/triage.module';
import { CasesModule } from './modules/cases/cases.module';
import { WorkflowModule } from './modules/workflow/workflow.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { InvestigationsModule } from './modules/investigations/investigations.module';
import { EvidenceModule } from './modules/evidence/evidence.module';
import { ContainmentModule } from './modules/containment/containment.module';
import { RecoveryModule } from './modules/recovery/recovery.module';
import { CapaModule } from './modules/capa/capa.module';
import { RegulatoryModule } from './modules/regulatory/regulatory.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { PlatformModule } from './platform/platform.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    // In-process event bus (architecture.md §5: "modules communicate in-process via an event
    // emitter — no external message broker at MVP scale"). `wildcard`/`delimiter` let listeners
    // subscribe to a whole namespace (e.g. `case.*`) instead of every exact event name —
    // `notifications` and `RealtimeModule` both rely on this.
    EventEmitterModule.forRoot({ wildcard: true, delimiter: '.' }),

    // Powers SlaClockService's breach-sweep cron and (once wired) any other periodic job —
    // in-process, single-instance scheduling. Deliberately not a distributed job queue: this
    // deployment is single-instance at MVP, so there's no "which instance runs the cron" problem
    // yet to solve. Revisit if/when this runs multi-instance (same trigger condition as Redis).
    ScheduleModule.forRoot(),

    // Rate limiting — in-memory store (no Redis; see docs/CHANGELOG.md's cross-cutting
    // infrastructure entry for why that's deliberate at this stage, not an oversight). A single
    // global limit for now; per-route overrides (e.g. a stricter one on /auth/login) use
    // `@Throttle()` where they're added.
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get<number>('THROTTLE_TTL_MS', 60000),
          limit: config.get<number>('THROTTLE_LIMIT', 100),
        },
      ],
    }),

    // In-memory cache (see CacheModule usage in ConfigurationService) — deliberately not Redis;
    // same reasoning as rate limiting above. `isGlobal` so any module can inject `CACHE_MANAGER`
    // without importing this module explicitly.
    CacheModule.register({ isGlobal: true, ttl: 30000 }),

    DatabaseModule,
    HealthModule,
    RealtimeModule,
    AuditModule,
    IdentityModule,
    ConfigurationModule,
    IncidentsModule,
    TriageModule,
    // WorkflowModule before CasesModule — cases depends on workflow (for the closure-approval
    // gate), not the other way around; see WorkflowModule's own doc comment.
    WorkflowModule,
    CasesModule,
    NotificationsModule,
    InvestigationsModule,
    EvidenceModule,
    ContainmentModule,
    RecoveryModule,
    CapaModule,
    RegulatoryModule,
    TasksModule,
    PlatformModule,
  ],
  providers: [
    // Order here reflects Nest's actual execution order, not registration order (all guards
    // always run before all interceptors) — listed in that order for readability. ThrottlerGuard
    // runs first and applies to every request, authenticated or not — rate limiting an
    // unauthenticated brute-force attempt against /auth/login matters as much as limiting an
    // authenticated one.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
  ],
})
export class AppModule {}
