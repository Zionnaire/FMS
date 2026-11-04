import { IsString, MinLength } from 'class-validator';

export class CancelContainmentDto {
  @IsString()
  @MinLength(3)
  reason!: string;
}
