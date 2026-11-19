import { IsString, Length, MinLength } from 'class-validator';

/** Body for `POST /auth/mfa/verify` — the second step of a login for a user with MFA enabled.
 * `code` accepts either a 6-digit TOTP code or a longer backup/recovery code; `AuthService`
 * tries TOTP first, then falls back to backup-code matching, so the length isn't fixed here. */
export class VerifyMfaDto {
  @IsString()
  @MinLength(10)
  mfaChallengeToken!: string;

  @IsString()
  @Length(6, 20)
  code!: string;
}
