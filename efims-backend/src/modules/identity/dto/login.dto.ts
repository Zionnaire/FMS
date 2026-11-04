import { IsEmail, IsString, Matches, MinLength } from 'class-validator';

export class LoginDto {
  /** Identifies which tenant to authenticate against — MVP has only `bank-1` live, but every
   * login is tenant-scoped from day one per docs/architecture.md §4.2. In production this would
   * typically come from the subdomain instead of a request field; a field is simplest for MVP
   * and for the many-Render-services-one-login-page reality of a starter tier deployment. */
  @IsString()
  @Matches(/^[a-z0-9-]+$/, { message: 'tenantSlug must be lowercase letters, digits, and hyphens only' })
  tenantSlug!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}
