import { InvestigationPlanStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateInvestigationPlanDto {
  @IsString()
  @MinLength(10)
  objectives!: string;

  @IsString()
  @MinLength(10)
  scope!: string;

  @IsOptional()
  @IsEnum(InvestigationPlanStatus)
  status?: InvestigationPlanStatus;
}
