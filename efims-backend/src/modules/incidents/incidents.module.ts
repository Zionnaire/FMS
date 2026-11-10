import { Module } from '@nestjs/common';
import { ConfigurationModule } from '../configuration/configuration.module';
import { IdentityModule } from '../identity/identity.module';
import { MlGatewayModule } from '../ml-gateway/ml-gateway.module';
import { IncidentsController } from './incidents.controller';
import { IncidentsService } from './incidents.service';
import { SignalsController } from './signals.controller';
import { SignalsService } from './signals.service';
import { WhistleblowerVaultService } from './whistleblower-vault.service';

@Module({
  // AuditModule is @Global() (see its own doc comment) so it isn't listed here, matching
  // IdentityModule/ConfigurationModule's own imports.
  imports: [ConfigurationModule, IdentityModule, MlGatewayModule],
  controllers: [SignalsController, IncidentsController],
  providers: [SignalsService, IncidentsService, WhistleblowerVaultService],
  // Exported for `triage`/`cases` to consume once they exist — same "talk through the public
  // service, not the table" boundary this module itself relies on for identity/configuration.
  exports: [SignalsService, IncidentsService],
})
export class IncidentsModule {}
