import { ObligationType } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateObligationDto {
  @IsEnum(ObligationType)
  obligationType!: ObligationType;

  @IsString()
  @MinLength(10)
  description!: string;

  @IsOptional()
  @IsString()
  regulatorName?: string;

  /** Statutory deadline — see `RegulatoryObligation`'s doc comment in schema.prisma for why
   * there is deliberately no pause mechanism anywhere near this field. */
  @IsDateString()
  deadline!: string;
}
