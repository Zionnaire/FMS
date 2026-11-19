import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.interface';
import { AuthService } from './auth.service';
import { ConfirmMfaEnrollmentDto } from './dto/confirm-mfa-enrollment.dto';
import { DisableMfaDto } from './dto/disable-mfa.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { VerifyMfaDto } from './dto/verify-mfa.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** Overrides the global throttler's `default` limit (100/min, `app.module.ts`) with a much
   * tighter one — the global limit was never actually the login-specific brute-force protection
   * its own doc comment claimed; this closes that gap. Keyed by IP by default (ThrottlerGuard's
   * default tracker), same as every other route. */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  /** Second step of a login for an MFA-enrolled user — same tight throttle as `login` itself,
   * since this is also a credential-guessing surface (the challenge token alone doesn't prove
   * anything without the right code). */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('mfa/verify')
  verifyMfa(@Body() dto: VerifyMfaDto) {
    return this.authService.verifyMfaAndLogin(dto.mfaChallengeToken, dto.code);
  }

  /** The four endpoints below all act on the CALLER's own account — no `@Roles()` gate beyond
   * the global `JwtAuthGuard` (every authenticated role, including Reporter, can secure their
   * own login), and no separate "admin enrolls someone else's MFA" path exists or should: a
   * second factor only means something if the account holder is the one who set it up. */
  @Get('mfa/status')
  mfaStatus(@CurrentUser() actor: AuthenticatedUser) {
    return this.authService.getMfaStatus(actor);
  }

  @Post('mfa/enroll/start')
  startMfaEnrollment(@CurrentUser() actor: AuthenticatedUser) {
    return this.authService.startMfaEnrollment(actor);
  }

  @Post('mfa/enroll/confirm')
  confirmMfaEnrollment(@CurrentUser() actor: AuthenticatedUser, @Body() dto: ConfirmMfaEnrollmentDto) {
    return this.authService.confirmMfaEnrollment(actor, dto.code);
  }

  @Post('mfa/disable')
  @HttpCode(HttpStatus.NO_CONTENT)
  async disableMfa(@CurrentUser() actor: AuthenticatedUser, @Body() dto: DisableMfaDto): Promise<void> {
    await this.authService.disableMfa(actor, dto.password);
  }

  @Public()
  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() dto: RefreshDto): Promise<void> {
    // @Public() here is about JwtAuthGuard, not about authorization: logout only needs the
    // refresh token (which is itself proof of a prior valid login) — it doesn't need a live
    // access token, which may well already be the expired one that made the caller want to
    // log out in the first place.
    await this.authService.logout(dto.refreshToken);
  }
}
