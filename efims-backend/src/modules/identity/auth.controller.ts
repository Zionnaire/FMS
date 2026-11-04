import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';

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
