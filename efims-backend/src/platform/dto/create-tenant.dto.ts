import { IsEmail, IsString, Matches, MinLength } from 'class-validator';

export class CreateTenantDto {
  @IsString()
  @MinLength(2)
  name!: string;

  /** Same shape `LoginDto.tenantSlug` already validates — lowercase letters, digits, hyphens. */
  @Matches(/^[a-z0-9-]+$/, { message: 'slug must be lowercase letters, digits, and hyphens only' })
  slug!: string;

  @IsEmail()
  adminEmail!: string;

  @IsString()
  @MinLength(2)
  adminFullName!: string;

  @IsString()
  @MinLength(8)
  adminPassword!: string;
}
