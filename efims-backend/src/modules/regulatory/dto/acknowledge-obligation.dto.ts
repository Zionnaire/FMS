import { IsOptional, IsString } from 'class-validator';

/** Records that the regulator confirmed receipt — see `RegulatoryService`'s own doc comment for
 * why this is a manually-exercised seam, not a real inbound webhook, at MVP. */
export class AcknowledgeObligationDto {
  @IsOptional()
  @IsString()
  acknowledgedRef?: string;
}
