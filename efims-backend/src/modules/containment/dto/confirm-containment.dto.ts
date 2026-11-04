import { IsOptional, IsString } from 'class-validator';

/** Records a positive `ActionConfirmed` from the source system — see this module's own doc
 * comment for why this is a manually-exercised seam, not a real inbound webhook, at MVP. */
export class ConfirmContainmentDto {
  @IsOptional()
  @IsString()
  confirmationRef?: string;
}
