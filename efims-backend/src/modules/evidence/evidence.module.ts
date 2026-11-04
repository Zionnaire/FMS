import { Module } from '@nestjs/common';
import { CasesModule } from '../cases/cases.module';
import { EvidenceController, EvidenceQueueController } from './evidence.controller';
import { EvidenceService } from './evidence.service';

/** Imports `CasesModule` directly, same one-directional shape as `InvestigationsModule` — nothing
 * in `cases` needs anything from `evidence`, so there's no circularity to design around. */
@Module({
  imports: [CasesModule],
  controllers: [EvidenceController, EvidenceQueueController],
  providers: [EvidenceService],
  exports: [EvidenceService],
})
export class EvidenceModule {}
