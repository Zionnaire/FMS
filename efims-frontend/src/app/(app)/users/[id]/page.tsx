import { notFound } from "next/navigation";
import { requireSession } from "@/features/auth/session";
import { listUsers, findUser, listAccessChangesForUser } from "@/features/users/api";
import { decideAccessChangeAction } from "@/features/users/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shell/status-badge";
import { SubmitButton } from "@/components/shell/submit-button";
import { RequestAccessChangeForm } from "./request-access-change-form";

export default async function UserDetailPage(props: PageProps<"/users/[id]">) {
  const { id } = await props.params;
  const { accessToken, user: actor } = await requireSession();

  const users = await listUsers(accessToken);
  const target = findUser(users, id);
  if (!target) notFound();

  const isAdmin = actor.role === "ADMIN";
  const changes = isAdmin ? await listAccessChangesForUser(accessToken, id) : [];

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold text-on-surface">{target.fullName}</h1>
        <p className="mt-1 text-xs text-on-surface-variant">{target.email}</p>
      </div>

      <Card className="border-outline-variant shadow-card">
        <CardContent className="grid grid-cols-2 gap-3 pt-4 text-xs sm:grid-cols-4">
          <div><p className="text-on-surface-variant uppercase">Role</p><p className="font-medium text-on-surface">{target.role.replaceAll("_", " ")}</p></div>
          <div><p className="text-on-surface-variant uppercase">Clearance</p><p className="font-medium text-on-surface">{target.clearanceLevel}</p></div>
          <div><p className="text-on-surface-variant uppercase">Status</p><StatusBadge status={target.status} tone={target.status === "ACTIVE" ? "positive" : target.status === "SUSPENDED" ? "warning" : "critical"} /></div>
          <div>
            <p className="text-on-surface-variant uppercase">Compartments</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {target.compartments.length === 0 && <span className="text-on-surface-variant">STANDARD only</span>}
              {target.compartments.map((c) => <Badge key={c} className="bg-surface-container-high text-on-surface-variant">{c}</Badge>)}
            </div>
          </div>
        </CardContent>
      </Card>

      {!isAdmin && (
        <Card className="border-outline-variant shadow-card">
          <CardContent className="pt-4 text-sm text-on-surface-variant">Role and compartment changes are managed by an administrator.</CardContent>
        </Card>
      )}

      {isAdmin && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <Card className="border-outline-variant shadow-card lg:col-span-1">
            <CardHeader><CardTitle className="text-sm font-bold text-on-surface">Request access change</CardTitle></CardHeader>
            <CardContent><RequestAccessChangeForm userId={id} /></CardContent>
          </Card>

          <div className="space-y-3 lg:col-span-2">
            {changes.length === 0 && (
              <div className="rounded-2xl border border-dashed border-outline-variant/50 bg-surface-container-low p-6 text-center text-xs text-on-surface-variant">
                No access change requests yet.
              </div>
            )}
            {changes.map((change) => (
              <Card key={change.id} className="border-outline-variant shadow-card">
                <CardContent className="space-y-2 pt-4 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-on-surface">{change.changeType.replaceAll("_", " ")}{change.payload.role ? `: ${change.payload.role}` : change.payload.compartment ? `: ${change.payload.compartment}` : ""}</span>
                    <StatusBadge status={change.status} tone={change.status === "APPROVED" ? "positive" : change.status === "REJECTED" ? "critical" : "warning"} />
                  </div>
                  <p className="text-on-surface-variant">{change.requestNotes}</p>
                  {change.decisionNotes && <p className="text-on-surface-variant">Decision: {change.decisionNotes}</p>}
                  {change.status === "PENDING" && change.requestedBy === actor.sub && (
                    <p className="border-t border-outline-variant pt-2 text-on-surface-variant">Awaiting a different admin&apos;s decision — you requested this change.</p>
                  )}
                  {change.status === "PENDING" && change.requestedBy !== actor.sub && (
                    <div className="flex gap-2 border-t border-outline-variant pt-2">
                      <form action={async (fd: FormData) => { "use server"; await decideAccessChangeAction(change.id, id, true, fd); }}>
                        <input type="hidden" name="decisionNotes" value="Approved" />
                        <SubmitButton size="sm">Approve</SubmitButton>
                      </form>
                      <form action={async (fd: FormData) => { "use server"; await decideAccessChangeAction(change.id, id, false, fd); }}>
                        <input type="hidden" name="decisionNotes" value="Rejected" />
                        <SubmitButton size="sm" variant="destructive">Reject</SubmitButton>
                      </form>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
