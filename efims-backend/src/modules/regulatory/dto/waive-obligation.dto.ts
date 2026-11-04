import { IsString, MinLength } from 'class-validator';

export class WaiveObligationDto {
  @IsString()
  @MinLength(5)
  reason!: string;
}
