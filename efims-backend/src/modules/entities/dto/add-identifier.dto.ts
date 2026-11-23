import { EntityIdentifierType } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';

export class AddIdentifierDto {
  @IsEnum(EntityIdentifierType)
  type!: EntityIdentifierType;

  @IsString()
  @IsNotEmpty()
  value!: string;
}
