import { CaseUserRelationType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

export class AddCaseUserFlagDto {
  @IsUUID()
  userId!: string;

  @IsEnum(CaseUserRelationType)
  type!: CaseUserRelationType;

  @IsOptional()
  @IsString()
  reason?: string;
}
