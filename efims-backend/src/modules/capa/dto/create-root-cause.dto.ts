import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateRootCauseDto {
  @IsString()
  @MinLength(10)
  summary!: string;

  @IsOptional()
  @IsString()
  analysisMethod?: string;
}
