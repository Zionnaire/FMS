import { CapaValidationOutcome } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class ValidateCapaActionDto {
  @IsEnum(CapaValidationOutcome)
  outcome!: CapaValidationOutcome;

  @IsOptional()
  @IsString()
  notes?: string;
}
