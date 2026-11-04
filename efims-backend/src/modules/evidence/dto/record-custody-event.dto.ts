import { CustodyAction } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

export class RecordCustodyEventDto {
  @IsEnum(CustodyAction)
  action!: CustodyAction;

  @IsOptional()
  @IsUUID()
  relatedUserId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
