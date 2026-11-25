import { Global, Module } from '@nestjs/common';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';

/** Global for the same reason as DatabaseModule — every module that can deny access (which,
 * per CLAUDE.md non-negotiable #6, is every module with authorization checks) needs to write
 * audit events without a web of explicit imports. `AuditController` is what makes this the real
 * `audit` module rather than the write-only sink it started as — see AuditService's own doc
 * comment for the write-only-to-everyone-else / read-only-to-oversight-roles split.
 *
 * Deliberately does NOT import `CasesModule`/`IncidentsModule`, even though `AuditService.query()`
 * (added 2026-11-25, AUD-03) does consume `CasesService`/`IncidentsService` at runtime. Tried that
 * first and reverted it: declaring the import made this a genuine circular PROVIDER graph, not
 * just a circular module-import — `CasesService`/`IncidentsService`, and (confirmed live, by the
 * app actually failing to boot) transitively `UsersService` and everything else `CasesModule`'s own
 * import chain (`IdentityModule`, `WorkflowModule`, `TriageModule`, `IncidentsModule`) pulls in,
 * ALL inject `AuditService` themselves to write events. Fixing that with `forwardRef()` would mean
 * chasing it through every one of those services, which is exactly the "web of explicit imports"
 * this module's own `@Global()` design was built to avoid in the first place — far too invasive a
 * blast radius for a MEDIUM, defense-in-depth confidentiality fix. `AuditService` instead resolves
 * `CasesService`/`IncidentsService` lazily via `ModuleRef.get(..., { strict: false })`, which reads
 * from the already-built application container at call time rather than the static per-module
 * import graph — no module import needed here at all, so there's nothing to cycle. */
@Global()
@Module({
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
