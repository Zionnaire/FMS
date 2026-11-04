import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckError, HealthCheckService, HealthIndicatorResult } from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../database/prisma.service';

/**
 * Unauthenticated on purpose (`@Public()` bypasses `JwtAuthGuard` — see that decorator) — a
 * load balancer / uptime monitor calling this has no JWT to present, and never will. Two
 * distinct checks, matching the standard liveness/readiness split: `/health` only confirms the
 * process is up and answering (no DB call — if the process can respond at all, it's alive,
 * even if the database is unreachable); `/health/ready` additionally confirms the database is
 * actually reachable, for "should this instance receive traffic" decisions. `@SkipThrottle()`
 * on the whole controller — a load balancer polling this every few seconds should never risk
 * getting rate-limited into reporting a false unhealthy state.
 */
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Get()
  liveness() {
    return { status: 'ok' };
  }

  @Public()
  @Get('ready')
  @HealthCheck()
  readiness() {
    return this.health.check([(): Promise<HealthIndicatorResult> => this.checkDatabase()]);
  }

  private async checkDatabase(): Promise<HealthIndicatorResult> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { database: { status: 'up' } };
    } catch (err) {
      // Terminus determines overall status (and the 503 it returns) by catching a thrown
      // HealthCheckError from each indicator — just returning a "down" status object here
      // would silently report as healthy instead.
      throw new HealthCheckError('Database check failed', { database: { status: 'down', message: (err as Error).message } });
    }
  }
}
