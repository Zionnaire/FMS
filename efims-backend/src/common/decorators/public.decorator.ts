import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Marks a route as reachable without a valid access token — e.g. login, refresh. Checked by
 * `JwtAuthGuard`. There is no equivalent bypass for tenant/RLS enforcement; a `@Public()` route
 * still must not touch a tenant-scoped Prisma delegate outside of `withTenant`/
 * `forCurrentTenant`. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
