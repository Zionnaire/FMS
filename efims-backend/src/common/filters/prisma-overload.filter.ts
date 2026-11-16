import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import { Response } from 'express';
import { Prisma } from '@prisma/client';

/** Prisma error codes meaning "the database is temporarily unreachable/overloaded," not "the
 * query/request is wrong" — P1001 (can't reach the server at all) is the one a real, recurring
 * Neon connection drop in this dev environment actually throws (confirmed live, 2026-11-16: it
 * crashed the entire backend process because it reached neither this filter's original two
 * conditions nor any try/catch in the `@Cron` job it happened to fire from — see
 * `SlaClockService.sweepBreachedClocks`'s own doc comment for that half of the fix). P1002/P1008/
 * P1017 are the same family (timed out / server closed the connection) and were added
 * proactively, not yet individually confirmed live. */
const TRANSIENT_CONNECTIVITY_CODES = new Set(['P1001', 'P1002', 'P1008', 'P1017', 'P2024']);

/**
 * Catches the Prisma error shapes that mean "the database is temporarily unreachable or
 * overloaded," not "this request is wrong" — connection pool exhaustion and transient
 * connectivity drops (`TRANSIENT_CONNECTIVITY_CODES`) and an interactive transaction expiring
 * mid-flight ("Transaction API error" from `PrismaService.withTenant`'s `maxWait`/`timeout`) —
 * and turns them into a clean `503` with `Retry-After`, instead of whatever generic
 * `500 Internal server error` NestJS's default handler would otherwise produce. This is
 * deliberately NOT a fix for the underlying contention (that's `connection_limit`/
 * `AuditService.record`'s own round-trip reduction, see those files' own doc comments) — it's
 * the difference between a client seeing a clear, fast, actionable "the system is busy, retry
 * shortly" and either a confusing opaque 500 or (if a caller mistakenly raised timeouts to "fix"
 * this) a silent multi-minute hang. Every other exception — `HttpException`s, validation errors,
 * genuine bugs — is explicitly NOT this filter's concern and is rethrown unchanged for Nest's
 * default handling.
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaOverloadFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaOverloadFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost): void {
    const isTransientConnectivity = TRANSIENT_CONNECTIVITY_CODES.has(exception.code);
    const isTransactionExpired = exception.message.includes('Transaction API error');

    if (!isTransientConnectivity && !isTransactionExpired) {
      throw exception;
    }

    this.logger.warn(`Database overload — returning 503: ${exception.message.split('\n')[0]}`);

    const response = host.switchToHttp().getResponse<Response>();
    response
      .status(HttpStatus.SERVICE_UNAVAILABLE)
      .header('Retry-After', '5')
      .json({
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        error: 'Service Unavailable',
        message: 'The system is under heavy load right now — please retry in a few seconds.',
      });
  }
}
