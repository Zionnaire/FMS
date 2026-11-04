import { IsString, MinLength } from 'class-validator';

export class RejectContainmentDto {
  @IsString()
  @MinLength(3)
  reason!: string;
}
