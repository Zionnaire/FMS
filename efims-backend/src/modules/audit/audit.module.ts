import { Global, Module } from '@nestjs/common';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';

/** Global for the same reason as DatabaseModule — every module that can deny access (which,
 * per CLAUDE.md non-negotiable #6, is every module with authorization checks) needs to write
 * audit events without a web of explicit imports. `AuditController` is what makes this the real
 * `audit` module rather than the write-only sink it started as — see AuditService's own doc
 * comment for the write-only-to-everyone-else / read-only-to-oversight-roles split. */
@Global()
@Module({
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
