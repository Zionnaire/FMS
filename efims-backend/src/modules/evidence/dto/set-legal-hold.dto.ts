import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class SetLegalHoldDto {
  @IsBoolean()
  hold!: boolean;

  @IsOptional()
  @IsString()
  reason?: string;
}
