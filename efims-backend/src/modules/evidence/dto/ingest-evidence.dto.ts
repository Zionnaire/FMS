import { EvidenceCategory } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class IngestEvidenceDto {
  @IsEnum(EvidenceCategory)
  category!: EvidenceCategory;

  @IsString()
  @MinLength(2)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  externalRef?: string;

  @IsOptional()
  @IsString()
  sourceSystem?: string;

  /** The actual content being vaulted — hashed server-side (SHA-256), never stored verbatim.
   * A stand-in for a real file upload; see `EvidenceItem`'s doc comment in schema.prisma for why
   * no object-storage integration exists yet. */
  @IsString()
  @MinLength(1)
  content!: string;
}
