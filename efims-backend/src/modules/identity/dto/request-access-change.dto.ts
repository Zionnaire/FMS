import { AccessChangeType, Compartment, Role } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

/** `payload` shape depends on `changeType` — validated by hand in `AccessChangeService.request`
 * (not per-field decorators) since which fields are required/forbidden varies by type; a
 * `@ValidateIf` chain here would be harder to read than one explicit check in the service. */
export class RequestAccessChangeDto {
  @IsEnum(AccessChangeType)
  changeType!: AccessChangeType;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsEnum(Compartment)
  compartment?: Compartment;

  /** GRANT_COMPARTMENT only — omit for a permanent grant. */
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsString()
  @MinLength(5)
  requestNotes!: string;
}
