import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class DecideAccessChangeDto {
  @IsBoolean()
  approved!: boolean;

  @IsOptional()
  @IsString()
  decisionNotes?: string;
}
