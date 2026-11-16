import { Prisma } from '@prisma/client';
import { TenantScopedClient } from '../../infrastructure/database/prisma.service';

/**
 * A plain, dependency-injection-free function — deliberately NOT a method on `RecoveryService` —
 * because `CasesService.stats()` needs this exact aggregate (cross-case loss/recovery totals,
 * `LossEntry`/`RecoveryEntry` being `recovery`'s own owned tables) and `RecoveryModule` already
 * imports `CasesModule` for its own access checks (see `recovery.module.ts`'s own doc comment).
 * `CasesModule` importing `RecoveryModule` back would be a real circular module dependency that
 * NestJS's DI container refuses without `forwardRef()` — a heavier, less honest fix for what's
 * really just one shared read with no other dependencies of its own. Exporting a plain function
 * from this module (not wiring it through Nest's injector at all) lets `CasesService` call
 * `recovery`'s own query logic directly, honoring non-negotiable #2's intent (the owning module's
 * code runs the query, `cases` doesn't reimplement it against the raw tables) without the cycle.
 * `RecoveryService.getSummary`/`listAll` keep their own existing per-case/grouped-by-case variants
 * unchanged — this is only for the "one total across many cases" shape `stats()` needs, which
 * didn't exist anywhere before.
 */
export async function getLossRecoveryTotals(
  client: TenantScopedClient,
  caseIds: string[],
): Promise<{ totalLoss: Prisma.Decimal; totalRecovered: Prisma.Decimal }> {
  if (caseIds.length === 0) {
    return { totalLoss: new Prisma.Decimal(0), totalRecovered: new Prisma.Decimal(0) };
  }
  const [lossAgg, recoveryAgg] = await Promise.all([
    client.lossEntry.aggregate({ where: { caseId: { in: caseIds } }, _sum: { amount: true } }),
    client.recoveryEntry.aggregate({ where: { caseId: { in: caseIds } }, _sum: { amount: true } }),
  ]);
  return {
    totalLoss: lossAgg._sum.amount ?? new Prisma.Decimal(0),
    totalRecovered: recoveryAgg._sum.amount ?? new Prisma.Decimal(0),
  };
}
