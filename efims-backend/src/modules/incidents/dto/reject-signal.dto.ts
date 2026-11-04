import { IsString, MinLength } from 'class-validator';

export class RejectSignalDto {
  @IsString()
  @MinLength(5)
  reason!: string;
}
