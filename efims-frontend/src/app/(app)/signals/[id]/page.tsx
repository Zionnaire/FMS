import { notFound } from "next/navigation";
import { requireSession } from "@/features/auth/session";
import { getSignal } from "@/features/signals/api";
import { getConfigurationKeyDetail } from "@/features/configuration/api";
import type { Cd01IncidentTaxonomy } from "@/features/configuration/types";
import { ApiError } from "@/lib/backend-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shell/status-badge";
import { ValidateForm } from "./validate-form";
import { RejectForm } from "./reject-form";
import type { Role } from "@/features/auth/types";

/** Mirrors the backend's own `TRIAGE_ROLES` constant (`common/constants/roles.ts`) — gates
 * validate/reject. `GET /signals/:id` is intentionally open to any authenticated role (a signal's
 * own submitter needs to see it), but validate/reject is not, so the UI must hide the action
 * instead of letting a non-triage role submit a form the backend will 403. Found live: an
 * `INCIDENT_REPORTER` viewing their own submitted signal saw and could submit this form, only to
 * get a confusing post-submit 403 — same "UX convenience only, backend is what actually enforces
 * it" pattern as every other role check in this frontend (see sidenav.tsx). */
const TRIAGE_ROLES: Role[] = ["INVESTIGATOR", "TEAM_LEAD", "FRAUD_RISK_MANAGER", "TRIAGE_ANALYST", "ADMIN"];

export default async function SignalDetailPage(props: PageProps<"/signals/[id]">) {
  const { id } = await props.params;
  const { accessToken, user } = await requireSession();
  const canTriage = TRIAGE_ROLES.includes(user.role);

  let signal;
  try {
    signal = await getSignal(accessToken, id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  // Only fetched for roles that can actually see the validate form below — no point paying for
  // the round trip otherwise.
  const taxonomy =
    signal.status === "NEW" && canTriage
      ? ((await getConfigurationKeyDetail(accessToken, "CD_01_INCIDENT_TAXONOMY")).current?.value as Cd01IncidentTaxonomy | undefined)
      : undefined;

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-primary">{signal.source.replaceAll("_", " ")}</p>
          <h1 className="font-headline text-2xl font-semibold text-on-surface">{signal.summary}</h1>
        </div>
        <StatusBadge status={signal.status} tone={signal.status === "NEW" ? "warning" : signal.status === "REJECTED" ? "critical" : "positive"} />
      </div>

      <Card className="border-outline-variant shadow-card">
        <CardContent className="grid grid-cols-2 gap-3 pt-4 text-xs sm:grid-cols-4">
          <div><p className="text-on-surface-variant uppercase">Received</p><p className="font-medium text-on-surface">{new Date(signal.receivedAt).toLocaleString()}</p></div>
          {signal.externalRef && <div><p className="text-on-surface-variant uppercase">External ref</p><p className="font-medium text-on-surface">{signal.externalRef}</p></div>}
          {signal.incidentId && <div><p className="text-on-surface-variant uppercase">Incident</p><p className="font-mono text-on-surface">{signal.incidentId}</p></div>}
        </CardContent>
      </Card>

      {signal.status === "NEW" && canTriage && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Card className="border-outline-variant shadow-card">
            <CardHeader><CardTitle className="text-sm font-bold text-on-surface">Validate</CardTitle></CardHeader>
            <CardContent><ValidateForm signalId={id} categories={taxonomy?.categories ?? []} /></CardContent>
          </Card>
          <Card className="border-outline-variant shadow-card">
            <CardHeader><CardTitle className="text-sm font-bold text-on-surface">Reject</CardTitle></CardHeader>
            <CardContent><RejectForm signalId={id} /></CardContent>
          </Card>
        </div>
      )}

      {signal.status === "NEW" && !canTriage && (
        <Card className="border-outline-variant shadow-card">
          <CardContent className="pt-4 text-sm text-on-surface-variant">
            Awaiting triage review — your role doesn&apos;t validate or reject signals.
          </CardContent>
        </Card>
      )}

      {signal.status === "REJECTED" && signal.rejectedReason && (
        <Card className="border-error/30 bg-error-container/20 shadow-card">
          <CardContent className="pt-4 text-sm text-on-error-container">Rejected: {signal.rejectedReason}</CardContent>
        </Card>
      )}
    </>
  );
}
