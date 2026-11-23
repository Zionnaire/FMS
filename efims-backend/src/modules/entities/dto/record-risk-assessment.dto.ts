import { Type } from 'class-transformer';
import { SeverityTier } from '@prisma/client';
import { ArrayMinSize, IsArray, IsEnum, IsNotEmpty, IsNumber, IsString, Max, Min, ValidateNested } from 'class-validator';

/** One weighted factor behind a risk band — analyst-entered, never a vendor payload (see
 * EntityRiskAssessment's own schema.prisma doc comment on why `source` stays MANUAL in v1). */
class RiskFactorDto {
  @IsString()
  @IsNotEmpty()
  label!: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  weight!: number;

  @IsString()
  @IsNotEmpty()
  rationale!: string;
}

export class RecordRiskAssessmentDto {
  @IsEnum(SeverityTier)
  band!: SeverityTier;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RiskFactorDto)
  factors!: RiskFactorDto[];
}
