import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateFindingDto {
  @IsString()
  @MinLength(5)
  title!: string;

  @IsString()
  @MinLength(10)
  description!: string;

  @IsOptional()
  @IsString()
  supportingEvidence?: string;

  @IsOptional()
  @IsUUID()
  resolvesIssueId?: string;
}
