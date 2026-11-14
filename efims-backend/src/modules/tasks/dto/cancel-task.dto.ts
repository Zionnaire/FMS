import { IsString, MinLength } from 'class-validator';

export class CancelTaskDto {
  @IsString()
  @MinLength(3)
  reason!: string;
}
