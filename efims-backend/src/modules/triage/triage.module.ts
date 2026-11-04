import { Module } from '@nestjs/common';
import { ConfigurationModule } from '../configuration/configuration.module';
import { IdentityModule } from '../identity/identity.module';
import { IncidentsModule } from '../incidents/incidents.module';
import { TriageController } from './triage.controller';
import { TriageService } from './triage.service';

@Module({
  // AuditModule is @Global(), not listed here — same as ConfigurationModule/IncidentsModule.
  imports: [ConfigurationModule, IdentityModule, IncidentsModule],
  controllers: [TriageController],
  providers: [TriageService],
  exports: [TriageService],
})
export class TriageModule {}
