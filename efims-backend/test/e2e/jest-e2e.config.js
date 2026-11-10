/**
 * Dedicated Jest config for the e2e suite — separate from a future unit-test config because
 * these tests boot a real Nest application against a real Postgres database (`efims_test`, a
 * database of its own on the same Postgres instance as dev, never the dev/seed database itself —
 * see test/e2e/README.md) rather than mocking anything RLS-adjacent. `maxWorkers: 1` is
 * deliberate: every spec file shares one physical test database, and Postgres advisory/row locks
 * plus this project's own transaction-per-request pattern make concurrent spec files a real risk
 * of cross-test interference, not just slower — correctness over parallel speed for this suite.
 */
module.exports = {
  rootDir: '../..',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/e2e/specs/**/*.e2e-spec.ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/test/e2e/tsconfig.json' }] },
  moduleFileExtensions: ['js', 'json', 'ts'],
  globalSetup: '<rootDir>/test/e2e/setup/global-setup.js',
  globalTeardown: '<rootDir>/test/e2e/setup/global-teardown.js',
  // Generous — this suite hits a real remote Postgres (Neon) over the network, not localhost;
  // a single full-lifecycle fixture seed alone takes ~80s in this environment. See this file's
  // own doc comment and test/e2e/README.md.
  testTimeout: 600000,
  maxWorkers: 1,
  verbose: true,
};
