import { Role } from '@prisma/client';

/** Who may read `WhistleblowerIdentityVaultEntry` rows — see `WhistleblowerVaultService`'s own
 * doc comment for the reasoning. Split into its own file (2026-11-25, AUD-03) so `AuditService`
 * can reuse the same list to compartment-filter the audit trail (see
 * `AuditService.filterVisibleEvents`) without importing `whistleblower-vault.service.ts` itself —
 * that file imports `AuditService`, so a static import the other way round closed a genuine
 * circular require between the two (confirmed live: the app failed to boot with
 * `WhistleblowerVaultService (PrismaService, ?)`, an undefined-dependency error). A constant has
 * no reason to live in a file that also imports the very service trying to reuse it. */
export const VAULT_READ_ROLES: Role[] = [Role.COMPLIANCE_MLRO, Role.LEGAL_COUNSEL, Role.ADMIN];
