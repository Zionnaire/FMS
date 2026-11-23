import { EntityType } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';

export class CreateEntityDto {
  @IsEnum(EntityType)
  type!: EntityType;

  @IsString()
  @IsNotEmpty()
  displayName!: string;
}

export class UpdateEntityDto {
  @IsString()
  @IsNotEmpty()
  displayName!: string;
}
