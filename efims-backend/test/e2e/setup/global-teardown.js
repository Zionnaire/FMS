/** Nothing to tear down — the test database is left in place (truncated fresh on the next run's
 * global-setup) so a failed run's data can still be inspected with `psql`/Prisma Studio if needed. */
module.exports = async function globalTeardown() {};
