import { EntityRelationshipType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

export class AddRelationshipDto {
  @IsUUID()
  toEntityId!: string;

  @IsEnum(EntityRelationshipType)
  relationshipType!: EntityRelationshipType;

  @IsOptional()
  @IsString()
  rationale?: string;
}
