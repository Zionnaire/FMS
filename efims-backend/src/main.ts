import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { PrismaOverloadFilter } from './common/filters/prisma-overload.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // Without this, Nest never runs its module-destroy lifecycle (PrismaService.onModuleDestroy's
  // $disconnect included) on SIGTERM/SIGINT — it just lets the process die. Render sends SIGTERM
  // on every deploy and restart, so a live request or transaction mid-flight at that moment was
  // being cut off uncleanly rather than given a chance to finish — the same failure class that
  // produced the original audit hash-chain corruption (docs/CHANGELOG.md, 2026-09-30 entry).
  app.enableShutdownHooks();

  // Sets standard security headers (CSP, HSTS, X-Frame-Options, etc.) — a pure API backend
  // never renders HTML for a browser to attack, but this is still the standard baseline
  // hardening pass, and costs nothing to have.
  app.use(helmet());

  // Never wide open — the frontend is the only intended caller. `CORS_ORIGINS` is a
  // comma-separated allow-list (see .env.example); `credentials: true` because auth uses an
  // Authorization header sent from the browser, not cookies, but CORS still needs this for the
  // preflight to succeed when the frontend sends one.
  const corsOrigins = config
    .get<string>('CORS_ORIGINS', 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({ origin: corsOrigins, credentials: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip properties not declared on the DTO
      forbidNonWhitelisted: true, // reject requests that send extra fields, instead of silently dropping them
      transform: true,
    }),
  );

  // Turns the two specific Prisma errors a live 2026-11-16 concurrency load test produced
  // (connection pool exhaustion, an interactive transaction expiring under contention) into a
  // clean 503 + Retry-After — see that filter's own doc comment. Every other exception is
  // untouched.
  app.useGlobalFilters(new PrismaOverloadFilter());

  const port = config.get<number>('PORT', 3001);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`EFIMS backend listening on port ${port}`);
}

bootstrap();
