import { RecoveryMethod } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export class RecordRecoveryDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount!: number;

  @IsEnum(RecoveryMethod)
  method!: RecoveryMethod;

  @IsOptional()
  @IsString()
  description?: string;
}
