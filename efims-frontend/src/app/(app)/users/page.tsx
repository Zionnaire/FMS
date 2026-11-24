import Link from "next/link";
import { requireSession } from "@/features/auth/session";
import { listUsers } from "@/features/users/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/shell/status-badge";

export default async function UsersPage() {
  const { accessToken, user } = await requireSession();
  const isAdmin = user.role === "ADMIN";
  const users = await listUsers(accessToken);

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Users</h1>
          <p className="mt-1 text-xs text-on-surface-variant">{users.length} active user{users.length === 1 ? "" : "s"} in this tenant.</p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <Link href="/users/access-change-requests" className="rounded-full bg-surface-container px-4 py-2 text-xs font-semibold text-on-surface-variant transition-colors hover:text-primary">
              Access change requests
            </Link>
            <Link href="/users/new" className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-on-primary shadow-card transition-all hover:bg-primary-container">
              New user
            </Link>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-surface-container-low">
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Clearance</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id} className="hover:bg-surface-container-low/60">
                <TableCell>
                  {isAdmin ? (
                    <Link href={`/users/${u.id}`} className="font-medium text-primary hover:underline">{u.fullName}</Link>
                  ) : (
                    <span className="font-medium text-on-surface">{u.fullName}</span>
                  )}
                </TableCell>
                <TableCell className="text-xs text-on-surface-variant">{u.email}</TableCell>
                <TableCell className="font-mono text-xs text-on-surface-variant">{u.role?.replaceAll("_", " ") ?? "—"}</TableCell>
                <TableCell className="text-xs text-on-surface-variant">{u.clearanceLevel}</TableCell>
                <TableCell><StatusBadge status={u.status} tone={u.status === "ACTIVE" ? "positive" : u.status === "SUSPENDED" ? "warning" : "critical"} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
