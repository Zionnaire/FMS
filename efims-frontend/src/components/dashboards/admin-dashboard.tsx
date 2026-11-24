import Link from "next/link";
import { Users, UserCog, BadgeCheck, ShieldCheck } from "lucide-react";
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
  for (const u of users) {
    if (!u.role) continue;
    byRole.set(u.role, (byRole.get(u.role) ?? 0) + 1);
  }

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Administration</h1>
        <p className="mt-1 text-xs text-on-surface-variant">{users.length} active user{users.length === 1 ? "" : "s"} across {teams.length} team{teams.length === 1 ? "" : "s"}.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-3 rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-card">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--color-tertiary) 16%, white)" }}>
              <Users size={20} strokeWidth={2} className="text-tertiary" />
            </span>
            <span className="text-xs font-semibold text-on-surface-variant">Active users</span>
          </div>
          <span className="text-[28px] leading-none font-bold text-on-surface">{users.length}</span>
        </div>
        <div className="flex flex-col gap-3 rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-card">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--color-secondary) 16%, white)" }}>
              <UserCog size={20} strokeWidth={2} className="text-secondary" />
            </span>
            <span className="text-xs font-semibold text-on-surface-variant">Teams</span>
          </div>
          <span className="text-[28px] leading-none font-bold text-on-surface">{teams.length}</span>
        </div>
        <div className="flex flex-col gap-3 rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-card">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--color-info) 16%, white)" }}>
              <BadgeCheck size={20} strokeWidth={2} className="text-info" />
            </span>
            <span className="text-xs font-semibold text-on-surface-variant">Distinct roles</span>
          </div>
          <span className="text-[28px] leading-none font-bold text-on-surface">{byRole.size}</span>
        </div>
        <Link href="/users/new" className="flex flex-col gap-3 rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-card transition-colors hover:border-tertiary/40">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--color-tertiary) 16%, white)" }}>
              <ShieldCheck size={20} strokeWidth={2} className="text-tertiary" />
            </span>
            <span className="text-xs font-semibold text-on-surface-variant">Provisioning</span>
          </div>
          <p className="text-xs text-on-surface-variant">New user, role changes, and compartment grants →</p>
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-outline-variant/60 bg-surface-container-lowest shadow-card">
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
                {(u.compartments?.length ?? 0) > 0 && (
                  <span className="text-xs text-on-surface-variant">{u.compartments!.length} compartment{u.compartments!.length === 1 ? "" : "s"}</span>
                )}
                <Badge variant="outline" className="border-outline-variant text-on-surface-variant">{u.role?.replaceAll("_", " ") ?? "—"}</Badge>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <Link href="/configuration" className="w-fit rounded-lg bg-surface-container px-5 py-2.5 text-xs font-semibold text-on-surface-variant transition-colors hover:text-on-surface">
        Configuration register
      </Link>
    </>
  );
}
