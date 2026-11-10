import { Pool } from 'pg';

/** Every RLS-enabled table, read directly from Postgres's own catalog rather than a hand-kept
 * list — new tables are automatically covered as long as whoever adds one also enables RLS on it
 * (the same discipline rls-policies.sql already requires, and that Phase 2 of this hardening plan
 * adds a CI guard for). Uses the privileged DIRECT_URL connection purely to read catalog metadata
 * — no RLS bypass of application data happens through this function. */
export async function listRlsEnabledTables(): Promise<string[]> {
  const pool = new Pool({ connectionString: process.env.DIRECT_URL });
  try {
    const { rows } = await pool.query<{ relname: string }>(
      `SELECT c.relname
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = true
       ORDER BY c.relname`,
    );
    return rows.map((r) => r.relname);
  } finally {
    await pool.end();
  }
}

/** A raw connection authenticated as `efims_app` (the exact role the running application uses —
 * not the privileged owner role) that NEVER calls `set_config('app.current_tenant', ...)`. This
 * is the "raw efims_app database session with no tenant context" the tenant-isolation suite
 * needs — proof that RLS itself denies by default, independent of whether the application's own
 * `PrismaService.withTenant`/`forCurrentTenant` discipline is followed correctly everywhere. */
export class RawAppRoleSession {
  private readonly pool: Pool;

  constructor() {
    if (!process.env.DATABASE_URL?.includes('efims_test')) {
      throw new Error('RawAppRoleSession refused: DATABASE_URL does not point at efims_test.');
    }
    this.pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }

  /** Row count a no-context `efims_app` session sees on `table` — expected to be 0 for every
   * RLS-enabled table regardless of how many real rows exist, since `current_setting(...,
   * true)` returns NULL with no session variable set, and NULL never equals any `tenantId`. */
  async countVisibleRows(table: string): Promise<number> {
    const { rows } = await this.pool.query<{ count: string }>(`SELECT count(*)::int AS count FROM "${table}"`);
    return Number(rows[0].count);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

/** A raw connection authenticated as `efims_app`, but WITH tenant context explicitly set on the
 * connection's session (not transaction-locally the way `PrismaService.withTenant` does it) —
 * used only to prove tenant A genuinely cannot see tenant B's rows even by directly querying the
 * database with the real app role, independent of Prisma or any application-layer logic. */
export class RawTenantScopedSession {
  private readonly pool: Pool;

  constructor() {
    if (!process.env.DATABASE_URL?.includes('efims_test')) {
      throw new Error('RawTenantScopedSession refused: DATABASE_URL does not point at efims_test.');
    }
    this.pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }

  async countVisibleRows(table: string, tenantId: string): Promise<number> {
    const client = await this.pool.connect();
    try {
      await client.query(`SELECT set_config('app.current_tenant', $1, false)`, [tenantId]);
      const { rows } = await client.query<{ count: string }>(`SELECT count(*)::int AS count FROM "${table}"`);
      return Number(rows[0].count);
    } finally {
      await client.query(`SELECT set_config('app.current_tenant', '', false)`);
      client.release();
    }
  }

  /** The real, direct isolation proof: every row an RLS-scoped session can see on `table`, under
   * `tenantId`'s own context, must itself carry that same `tenantId` — never a different one.
   * Stronger than comparing row counts, which could coincidentally match across two tenants
   * without actually proving no row leaked across the boundary. */
  async distinctTenantIdsVisible(table: string, asTenantId: string): Promise<string[]> {
    const client = await this.pool.connect();
    try {
      await client.query(`SELECT set_config('app.current_tenant', $1, false)`, [asTenantId]);
      const { rows } = await client.query<{ tenantId: string }>(`SELECT DISTINCT "tenantId" FROM "${table}"`);
      return rows.map((r) => r.tenantId);
    } finally {
      // Reset before releasing back to the pool so a reused connection never leaks tenant
      // context into an unrelated later query — the exact failure mode a session-scoped
      // `set_config` could otherwise cause over a pooled connection.
      await client.query(`SELECT set_config('app.current_tenant', '', false)`);
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
