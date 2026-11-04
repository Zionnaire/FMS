import { Module } from '@nestjs/common';
import { CasesModule } from '../cases/cases.module';
import { IdentityModule } from '../identity/identity.module';
import { CapaController, CapaQueueController } from './capa.controller';
import { CapaService } from './capa.service';

/** Imports `CasesModule` (case access checks) and `IdentityModule` (`UsersService.
 * assertUserExists`, validating `CreateCapaActionDto.ownerId`) directly — a one-directional
 * leaf, same shape as `InvestigationsModule`/`EvidenceModule`. */
@Module({
  imports: [CasesModule, IdentityModule],
  controllers: [CapaController, CapaQueueController],
  providers: [CapaService],
  exports: [CapaService],
})
export class CapaModule {}
