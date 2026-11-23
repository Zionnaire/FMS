import { Module } from '@nestjs/common';
import { CasesModule } from '../cases/cases.module';
import { EntitiesController } from './entities.controller';
import { EntitiesService } from './entities.service';

/** Imports `CasesModule` directly (case-link access checks) — a one-directional leaf, same shape
 * as `RecoveryModule`/`ContainmentModule`; nothing in `cases` needs anything from `entities`. */
@Module({
  imports: [CasesModule],
  controllers: [EntitiesController],
  providers: [EntitiesService],
  exports: [EntitiesService],
})
export class EntitiesModule {}
