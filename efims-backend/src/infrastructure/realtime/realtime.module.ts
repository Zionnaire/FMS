import { Module } from '@nestjs/common';
import { IdentityModule } from '../../modules/identity/identity.module';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeService } from './realtime.service';

/**
 * Deliberately global-ish in spirit (exported for any feature module to inject
 * `RealtimeService`) without actually being `@Global()` — every consumer imports this module
 * explicitly, matching the codebase's existing convention of explicit imports over `@Global()`
 * except for the two infrastructure modules (`DatabaseModule`, `AuditModule`) that predate this
 * one and every module already needs.
 *
 * Known, accepted gap at MVP: a revoked refresh token / logged-out session doesn't drop an
 * already-connected socket — the access token stays valid (and the socket stays connected) until
 * it naturally expires (`JWT_ACCESS_TTL`, default 15m). Closing that gap needs either a
 * revocation check on every socket event (defeats the point of not re-verifying per-message) or
 * a way to push a forced-disconnect to a specific user's sockets when their session is revoked —
 * not built now, not needed until session revocation has a real, demonstrated urgency for this
 * system (paralleling how Redis/Kafka/Socket.IO itself were deferred until a concrete need
 * existed).
 */
@Module({
  imports: [IdentityModule],
  providers: [RealtimeGateway, RealtimeService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
