import { IsString, MinLength } from 'class-validator';

/** Body for `POST /auth/mfa/disable` — requires re-entering the account password, not just a
 * valid session, since turning MFA off is a sensitive action a stolen-but-still-logged-in
 * session shouldn't be able to do on its own. */
export class DisableMfaDto {
  @IsString()
  @MinLength(8)
  password!: string;
}
