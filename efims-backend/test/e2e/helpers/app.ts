import path from 'path';
import dotenv from 'dotenv';

// Must run before AppModule (and therefore ConfigModule) is ever imported, so every test file
// that imports this module first gets the test database/secrets, never the real dev ones.
// dotenv does not overwrite already-set process.env values, so this is also safe to call more
// than once across multiple spec files in the same worker process.
dotenv.config({ path: path.join(__dirname, '..', '.env.test') });

import { ValidationPipe, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';

export interface TestApp {
  app: INestApplication;
  http: ReturnType<typeof request>;
  close: () => Promise<void>;
}

/** Boots a real, full Nest application (every module AppModule wires up, same guards/pipes as
 * main.ts) against the efims_test database. One call per spec file's `beforeAll`, closed in
 * `afterAll` — not shared across spec files, since Jest runs each spec file in its own module
 * registry/process-like isolation and a shared app would outlive the file that created it. */
export async function createTestApp(): Promise<TestApp> {
  if (!process.env.DATABASE_URL?.includes('efims_test')) {
    throw new Error(
      'Refusing to boot the e2e test app: DATABASE_URL does not point at the efims_test database.',
    );
  }

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();

  // Same ValidationPipe config as main.ts — tests should see the exact same validation behavior
  // production traffic does, not a looser test-only default.
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  await app.init();

  return {
    app,
    http: request(app.getHttpServer()),
    close: () => app.close(),
  };
}
