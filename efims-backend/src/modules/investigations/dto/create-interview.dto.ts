import { IntervieweeRole } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateInterviewDto {
  @IsString()
  @MinLength(2)
  intervieweeName!: string;

  @IsEnum(IntervieweeRole)
  intervieweeRole!: IntervieweeRole;

  @IsOptional()
  @IsUUID()
  intervieweeUserId?: string;

  @IsDateString()
  conductedAt!: string;

  @IsString()
  @MinLength(10)
  summary!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
