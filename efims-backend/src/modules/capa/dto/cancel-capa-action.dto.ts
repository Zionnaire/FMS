import { IsString, MinLength } from 'class-validator';

export class CancelCapaActionDto {
  @IsString()
  @MinLength(3)
  reason!: string;
}
