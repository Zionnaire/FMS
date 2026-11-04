import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class DecideApprovalDto {
  @IsBoolean()
  approved!: boolean;

  @IsOptional()
  @IsString()
  decisionNotes?: string;
}
