import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';

/** Declares which roles may reach a route; enforced by `RolesGuard`. This is a coarse,
 * role-only check — the fuller 7-condition case-access rule from docs/architecture.md §4.3
 * (tenant, role, team, subject/conflict, clearance, compartment) belongs to the `cases` module
 * once it exists, not here. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
