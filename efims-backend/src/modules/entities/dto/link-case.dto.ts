import { EntityCaseLinkRole } from '@prisma/client';
import { IsEnum, IsUUID } from 'class-validator';

export class LinkCaseDto {
  @IsUUID()
  caseId!: string;

  @IsEnum(EntityCaseLinkRole)
  role!: EntityCaseLinkRole;
}
