import { notFound } from "next/navigation";
import { requireSession } from "@/features/auth/session";

/**
 * Guards the entire `/users` segment (list, detail, new, access-change-requests) — added
 * 2026-11-24 after an RBAC audit found none of those pages had a server-side role check at all,
 * only nav-hiding (`USER_MANAGEMENT_ROLES = ["ADMIN"]` in `sidenav.tsx`). Any authenticated user
 * navigating directly to `/users` or `/users/:id` saw every tenant user's role/clearance/
 * compartments/email, since the backend itself had the same gap (now fixed in
 * `UsersService.list`, which returns a minimal `{id, fullName, status}` shape to non-`ADMIN`
 * callers) — without this guard, those pages would now just render "undefined" for a non-admin
 * instead of leaking data, which is safe but broken. `notFound()`, not a redirect, matching how
 * this app already handles "you can't see this" elsewhere (e.g. a 403 on a case/incident).
 */
export default async function UsersLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireSession();
  if (user.role !== "ADMIN") {
    notFound();
  }
  return <>{children}</>;
}
