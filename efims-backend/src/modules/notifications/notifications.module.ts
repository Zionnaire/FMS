import { Module } from '@nestjs/common';
import { RealtimeModule } from '../../infrastructure/realtime/realtime.module';
import { IdentityModule } from '../identity/identity.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

/**
 * Imports `IdentityModule` for recipient resolution only (`UsersService`/`TeamsService`) and
 * `RealtimeModule` for the live-push half of IN_APP delivery — never `WorkflowModule` or
 * `CasesModule`. Those modules don't know this one exists either; the only coupling is the
 * shared event contracts in `src/common/events/domain-events.ts`. That's what lets this module
 * be added to `AppModule` last, after everything it reacts to, without any of those modules
 * needing to change.
 */
@Module({
  imports: [IdentityModule, RealtimeModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
