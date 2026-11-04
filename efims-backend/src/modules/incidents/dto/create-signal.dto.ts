import { SignalSource } from '@prisma/client';
import { IsBoolean, IsEnum, IsObject, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';

export class CreateSignalDto {
  @IsEnum(SignalSource)
  source!: SignalSource;

  @IsOptional()
  @IsString()
  externalRef?: string;

  @IsString()
  @MinLength(5)
  summary!: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  // --- Whistleblower-only fields. Never persisted onto `payload` — SignalsService routes
  // these to WhistleblowerVaultService instead. Validated conditionally rather than split into
  // a separate DTO, since the client submits one form regardless of source. ---

  @ValidateIf((dto: CreateSignalDto) => dto.source === SignalSource.WHISTLEBLOWER)
  @IsBoolean()
  isAnonymous?: boolean;

  @ValidateIf(
    (dto: CreateSignalDto) => dto.source === SignalSource.WHISTLEBLOWER && dto.isAnonymous === false,
  )
  @IsString()
  reporterName?: string;

  @IsOptional()
  @IsString()
  reporterContact?: string;
}
