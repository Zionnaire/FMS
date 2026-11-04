import { Role } from '@prisma/client';

/** The decoded access-token JWT payload, attached to `request.user` by `JwtAuthGuard`. Kept in
 * `common/` (not `modules/identity/`) because guards, interceptors, and every other module's
 * controllers need this type without depending on the identity module's internals. */
export interface AuthenticatedUser {
  /** User id (JWT `sub`). */
  sub: string;
  tenantId: string;
  email: string;
  role: Role;
  clearanceLevel: number;
}
