import { Module } from '@nestjs/common';
import { CasesModule } from '../cases/cases.module';
import { InvestigationsController } from './investigations.controller';
import { InvestigationsService } from './investigations.service';

/** Imports `CasesModule` directly — unlike `workflow`, nothing in `cases` needs anything from
 * `investigations`, so there's no circular-dependency concern to design around here. */
@Module({
  imports: [CasesModule],
  controllers: [InvestigationsController],
  providers: [InvestigationsService],
  exports: [InvestigationsService],
})
export class InvestigationsModule {}
