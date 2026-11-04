import { IsISO8601, IsOptional, IsString } from 'class-validator';

export class RatifyConfigurationVersionDto {
  /** Defaults to "now" if omitted — see ConfigurationService.ratify. A future-dated value is
   * allowed (e.g. ratifying today a change that takes effect at the start of next quarter). */
  @IsOptional()
  @IsISO8601()
  effectiveDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
