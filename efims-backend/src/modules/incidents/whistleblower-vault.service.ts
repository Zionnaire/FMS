import { ForbiddenException, Injectable } from '@nestjs/common';
import { AuditOutcome } from '@prisma/client';
import { PrismaService, TenantScopedClient } from '../../infrastructure/database/prisma.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user.interface';
import { AuditService } from '../audit/audit.service';
import { VAULT_READ_ROLES } from './whistleblower-vault.constants';

/**
 * The ONLY code path that ever writes or reads `WhistleblowerIdentityVaultEntry` — per
 * CLAUDE.md non-negotiable #7, reporter identity lives separately from case content, and that
 * separation only means something if there's exactly one narrow gate onto it rather than
 * identity fields scattered across whichever service happens to touch a whistleblower signal.
 *
 * Read access is restricted to roles that plausibly need to know who a whistleblower is
 * (investigating retaliation claims, statutory disclosure obligations, legal defense) — NOT the
 * investigator working the resulting incident/case day-to-day, who should never need the
 * reporter's identity to do their job. Every read is audited regardless of outcome, not just
 * denials — unlike RolesGuard's role-check audit (which only logs DENIED), *access itself* to
 * this vault is sensitive enough to log every time, matching how a real whistleblower-protection
 * program logs every identity-vault access for its own audit obligations.
 */
// Moved to `./whistleblower-vault.constants` (2026-11-25, AUD-03) — see that file's doc comment.

export interface WhistleblowerIdentityInput {
  isAnonymous: boolean;
  reporterName?: string;
  reporterContact?: string;
}

@Injectable()
export class WhistleblowerVaultService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Takes the caller's already-open transaction (`tx`) rather than opening its own — called
   * only by SignalsService.create, inside the same transaction that creates the Signal itself,
   * so the two writes commit or fail together. A whistleblower Signal must never exist without
   * its vault entry (even an "anonymous" one, which still needs a row here to record that fact)
   * — never called from anywhere else, and never given its own top-level transaction.
   */
  async createEntry(
    tx: TenantScopedClient,
    tenantId: string,
    signalId: string,
    identity: WhistleblowerIdentityInput,
  ): Promise<void> {
    await tx.whistleblowerIdentityVaultEntry.create({
      data: {
        tenantId,
        signalId,
        isAnonymous: identity.isAnonymous,
        reporterName: identity.isAnonymous ? undefined : identity.reporterName,
        reporterContact: identity.reporterContact,
      },
    });
  }

  /** Throws ForbiddenException for any caller outside VAULT_READ_ROLES — there is no bypass,
   * including for ADMIN acting on someone else's behalf without the role check; ADMIN is IN the
   * allow-list itself, deliberately, as the MVP stand-in for "whoever administers the
   * whistleblower program" until that's a real role. */
  async getIdentity(actor: AuthenticatedUser, signalId: string) {
    const permitted = VAULT_READ_ROLES.includes(actor.role);

    await this.auditService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.sub,
      action: 'incidents.whistleblower_vault.read',
      entityType: 'WhistleblowerIdentityVaultEntry',
      entityId: signalId,
      outcome: permitted ? AuditOutcome.SUCCESS : AuditOutcome.DENIED,
    });

    if (!permitted) {
      throw new ForbiddenException('Not authorized to view whistleblower identity records');
    }

    return this.prisma.forCurrentTenant((tx) =>
      tx.whistleblowerIdentityVaultEntry.findUnique({ where: { signalId } }),
    );
  }
}
