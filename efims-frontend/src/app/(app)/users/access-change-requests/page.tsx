import Link from "next/link";
import { requireSession } from "@/features/auth/session";
import { listAllAccessChangeRequests, listUsers, userDisplayNameMap } from "@/features/users/api";
import { decideAccessChangeAction } from "@/features/users/actions";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/shell/status-badge";
import { SubmitButton } from "@/components/shell/submit-button";

export default async function AccessChangeRequestsPage() {
  const { accessToken, user: actor } = await requireSession();
  const [changes, users] = await Promise.all([listAllAccessChangeRequests(accessToken), listUsers(accessToken)]);
  const nameOf = userDisplayNameMap(users);

  const pending = changes.filter((c) => c.status === "PENDING");
  const decided = changes.filter((c) => c.status !== "PENDING");

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Access change requests</h1>
        <p className="mt-1 text-xs text-on-surface-variant">{pending.length} pending decision{pending.length === 1 ? "" : "s"} — maker-checker: the requester cannot decide their own request.</p>
      </div>

      <div className="space-y-3">
        {changes.length === 0 && (
          <div className="rounded-2xl border border-dashed border-outline-variant/50 bg-surface-container-low p-6 text-center text-xs text-on-surface-variant">
            No access change requests yet.
          </div>
        )}
        {[...pending, ...decided].map((change) => (
          <Card key={change.id} className="border-outline-variant shadow-card">
            <CardContent className="space-y-2 pt-4 text-xs">
              <div className="flex items-center justify-between">
                <Link href={`/users/${change.targetUserId}`} className="font-semibold text-primary hover:underline">
                  {nameOf.get(change.targetUserId) ?? change.targetUserId}
                </Link>
                <StatusBadge status={change.status} tone={change.status === "APPROVED" ? "positive" : change.status === "REJECTED" ? "critical" : "warning"} />
              </div>
              <p className="text-on-surface">{change.changeType.replaceAll("_", " ")}{change.payload.role ? `: ${change.payload.role}` : change.payload.compartment ? `: ${change.payload.compartment}` : ""}</p>
              <p className="text-on-surface-variant">{change.requestNotes}</p>
              <p className="text-on-surface-variant">Requested by {nameOf.get(change.requestedBy) ?? change.requestedBy}</p>
              {change.decisionNotes && <p className="text-on-surface-variant">Decision: {change.decisionNotes}</p>}
              {change.status === "PENDING" && change.requestedBy === actor.sub && (
                <p className="border-t border-outline-variant pt-2 text-on-surface-variant">Awaiting a different admin&apos;s decision — you requested this change.</p>
              )}
              {change.status === "PENDING" && change.requestedBy !== actor.sub && (
                <div className="flex gap-2 border-t border-outline-variant pt-2">
                  <form action={async (fd: FormData) => { "use server"; await decideAccessChangeAction(change.id, change.targetUserId, true, fd); }}>
                    <input type="hidden" name="decisionNotes" value="Approved" />
                    <SubmitButton size="sm">Approve</SubmitButton>
                  </form>
                  <form action={async (fd: FormData) => { "use server"; await decideAccessChangeAction(change.id, change.targetUserId, false, fd); }}>
                    <input type="hidden" name="decisionNotes" value="Rejected" />
                    <SubmitButton size="sm" variant="destructive">Reject</SubmitButton>
                  </form>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
