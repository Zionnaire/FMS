/**
 * Runs once before the whole e2e suite. Loads test/e2e/.env.test (a dedicated `efims_test`
 * database — never the dev/seed database `neondb` this project has used throughout — see
 * test/e2e/README.md for how that database was created), then truncates every table so each full
 * suite run starts from a known-empty state regardless of what a previous run left behind.
 * Truncation runs via the privileged DIRECT_URL owner connection (not `efims_app`), since
 * `efims_app` isn't granted TRUNCATE on most tables (rls-policies.sql is deliberately
 * conservative about which grants it hands out) and the owner role bypasses RLS by default,
 * which is exactly what's wanted for test cleanup, never for anything the application itself
 * does at runtime.
 */
const path = require('path');
const dotenv = require('dotenv');
const { Client } = require('pg');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = async function globalSetup() {
  dotenv.config({ path: path.join(__dirname, '..', '.env.test') });

  if (!process.env.DIRECT_URL || !process.env.DIRECT_URL.includes('efims_test')) {
    throw new Error(
      'Refusing to run e2e global-setup: DIRECT_URL does not point at the efims_test database. ' +
        'Check test/e2e/.env.test before running the e2e suite — this guard exists specifically ' +
        'so a misconfigured env can never truncate the real dev/seed database.',
    );
  }

  // Neon's serverless compute suspends after idling and pays a real cold-start cost (several
  // seconds to tens of seconds) to resume on the first new connection — observed live as
  // whichever spec file Jest schedules first in a full suite run failing its own beforeAll
  // timeout, with no such failure when files run individually or once the database is already
  // warm. Both connection paths (DIRECT_URL, the privileged owner used here; DATABASE_URL, the
  // pooled efims_app connection the application itself uses) are warmed explicitly, with a short
  // pause after, so no individual spec file's own timeout ever has to absorb this cost.
  const direct = new Client({ connectionString: process.env.DIRECT_URL });
  await direct.connect();
  try {
    await direct.query('SELECT 1');

    const { rows } = await direct.query(
      `SELECT c.relname AS table_name
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname != '_prisma_migrations'`,
    );
    const tableNames = rows.map((r) => `"${r.table_name}"`).join(', ');
    if (tableNames) {
      await direct.query(`TRUNCATE TABLE ${tableNames} RESTART IDENTITY CASCADE`);
    }
  } finally {
    await direct.end();
  }

  const pooled = new Client({ connectionString: process.env.DATABASE_URL });
  await pooled.connect();
  try {
    await pooled.query('SELECT 1');
  } finally {
    await pooled.end();
  }

  await sleep(5000);
};
