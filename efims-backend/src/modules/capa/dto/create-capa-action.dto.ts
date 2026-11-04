import { CapaActionType } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateCapaActionDto {
  @IsOptional()
  @IsUUID()
  rootCauseId?: string;

  @IsEnum(CapaActionType)
  type!: CapaActionType;

  @IsString()
  @MinLength(5)
  title!: string;

  @IsString()
  @MinLength(10)
  description!: string;

  @IsUUID()
  ownerId!: string;

  @IsDateString()
  dueDate!: string;
}
