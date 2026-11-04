import { IsOptional, IsString } from 'class-validator';

export class CompleteCapaActionDto {
  @IsOptional()
  @IsString()
  completionNotes?: string;
}
