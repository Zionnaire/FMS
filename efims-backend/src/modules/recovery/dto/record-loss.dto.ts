import { LossCategory } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export class RecordLossDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount!: number;

  @IsEnum(LossCategory)
  category!: LossCategory;

  @IsOptional()
  @IsString()
  description?: string;
}
