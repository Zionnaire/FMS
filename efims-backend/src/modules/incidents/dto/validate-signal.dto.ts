import { Compartment } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MinLength, ValidateIf } from 'class-validator';

/**
 * Reviewer's decision that a NEW signal is real. Either creates a new Incident (the default —
 * `category`/`type`/`title`/`description` required), or attaches this signal to an existing one
 * as a corroborating report (`linkToIncidentId` provided — the dedupe path, a human decision,
 * not an algorithm; see the module-level doc comment in schema.prisma on why).
 */
export class ValidateSignalDto {
  @IsOptional()
  @IsUUID()
  linkToIncidentId?: string;

  // --- Required only when NOT linking to an existing incident ---

  @ValidateIf((dto: ValidateSignalDto) => !dto.linkToIncidentId)
  @IsString()
  category?: string;

  @ValidateIf((dto: ValidateSignalDto) => !dto.linkToIncidentId)
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  subtype?: string;

  @ValidateIf((dto: ValidateSignalDto) => !dto.linkToIncidentId)
  @IsString()
  @MinLength(5)
  title?: string;

  @ValidateIf((dto: ValidateSignalDto) => !dto.linkToIncidentId)
  @IsString()
  @MinLength(5)
  description?: string;

  /** Defaults to STANDARD, or is forced to WHISTLEBLOWING by IncidentsService regardless of
   * what's sent here if the signal's source is WHISTLEBLOWER. A reviewer may still elevate a
   * non-whistleblower incident to a stricter compartment (e.g. AML_MLRO, HR). */
  @IsOptional()
  @IsEnum(Compartment)
  compartment?: Compartment;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}
