import { IsString, Length } from 'class-validator';

/** Body for `POST /auth/mfa/enroll/confirm` — the 6-digit code from the authenticator app the
 * user just scanned the QR code into, proving they actually captured the secret correctly
 * before `AuthService.confirmMfaEnrollment` turns MFA on for real. */
export class ConfirmMfaEnrollmentDto {
  @IsString()
  @Length(6, 6)
  code!: string;
}
