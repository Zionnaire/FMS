import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

/** The EFIMS AI Service's severity model needs these structured facts (see schema.prisma's
 * `Incident` doc comment) — captured here, once, rather than re-entered on every "get suggestion"
 * click. Every field optional: a partial update only changes what's provided, and none of this is
 * required to use the rest of the app. `channel`/`reportedByType` are free text on the wire (the
 * UI constrains input to the vendor's accepted list via a `<select>`), not validated against a
 * fixed enum here — an external vendor's own vocabulary isn't this schema's to own. */
export class UpdateRiskFactorsDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  financialExposureNgn?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  customerImpactCount?: number;

  @IsOptional()
  @IsBoolean()
  ongoingThreat?: boolean;

  @IsOptional()
  @IsBoolean()
  insiderInvolvement?: boolean;

  @IsOptional()
  @IsBoolean()
  dataCompromise?: boolean;

  @IsOptional()
  @IsBoolean()
  regulatoryRelevance?: boolean;

  @IsOptional()
  @IsString()
  channel?: string;

  @IsOptional()
  @IsString()
  reportedByType?: string;
}
