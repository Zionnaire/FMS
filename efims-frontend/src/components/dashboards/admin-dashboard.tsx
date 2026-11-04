import Link from "next/link";
import { listUsers } from "@/features/users/api";
import { listTeams } from "@/features/teams/api";
import { Badge } from "@/components/ui/badge";

/** System Administrator's "Administration" — bespoke: provisioning/user-directory content, not a
 * case/incident queue (per the role brief: "no business-content access by default" — this
 * dashboard deliberately shows nothing about case/incident substance, only accounts and teams).
 * User creation and the `AccessChangeRequest` maker-checker flow now live at `/users` (added
 * 2026-10-29) — this stays a read-only summary/directory, linking out to that section rather than
 * duplicating its forms here. */
export async function AdminDashboard({ accessToken }: { accessToken: string }) {
  const [users, teams] = await Promise.all([listUsers(accessToken), listTeams(accessToken)]);
  const byRole = new Map<string, number>();
  for (const u of users) byRole.set(u.role, (byRole.get(u.role) ?? 0) + 1);

  return (
    <>
      <div>
        <h1 className="font-headline text-2xl font-semibold text-primary">Administration</h1>
        <p className="mt-1 text-xs text-on-surface-variant">{users.length} active user{users.length === 1 ? "" : "s"} across {teams.length} team{teams.length === 1 ? "" : "s"}.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col justify-between rounded-2xl border border-primary/20 bg-primary-container p-5 text-on-primary shadow-hero">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-secondary-fixed uppercase">Active users</span>
            <span className="material-symbols-outlined text-secondary-fixed">group</span>
          </div>
          <div className="mt-3 font-headline text-3xl font-bold text-surface-bright">{users.length}</div>
        </div>
        <div className="flex flex-col justify-between rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-5 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-outline uppercase">Teams</span>
            <span className="material-symbols-outlined text-on-surface-variant">groups</span>
          </div>
          <div className="mt-3 font-headline text-3xl font-bold text-primary">{teams.length}</div>
        </div>
        <div className="flex flex-col justify-between rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-5 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-outline uppercase">Distinct roles</span>
            <span className="material-symbols-outlined text-on-surface-variant">badge</span>
          </div>
          <div className="mt-3 font-headline text-3xl font-bold text-primary">{byRole.size}</div>
        </div>
        <Link href="/users/new" className="flex flex-col justify-between rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-5 shadow-card transition-colors hover:border-primary/40">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-outline uppercase">Provisioning</span>
            <span className="material-symbols-outlined text-on-surface-variant">admin_panel_settings</span>
          </div>
          <p className="mt-2 text-xs text-on-surface-variant">New user, role changes, and compartment grants →</p>
        </Link>
      </div>

      <div className="overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-card">
        <div className="border-b border-outline-variant/30 bg-surface-container-low px-5 py-3">
          <h2 className="text-sm font-bold text-on-surface">User directory</h2>
        </div>
        <ul className="divide-y divide-outline-variant/20">
          {users.map((u) => (
            <li key={u.id} className="flex items-center justify-between gap-4 px-5 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-on-surface">{u.fullName}</p>
                <p className="truncate text-xs text-on-surface-variant">{u.email}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {u.compartments.length > 0 && (
                  <span className="text-xs text-on-surface-variant">{u.compartments.length} compartment{u.compartments.length === 1 ? "" : "s"}</span>
                )}
                <Badge variant="outline" className="border-outline-variant text-on-surface-variant">{u.role.replaceAll("_", " ")}</Badge>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <Link href="/configuration" className="w-fit rounded-full bg-surface-container px-5 py-2.5 text-xs font-semibold text-on-surface-variant transition-colors hover:text-on-surface">
        Configuration register
      </Link>
    </>
  );
}
