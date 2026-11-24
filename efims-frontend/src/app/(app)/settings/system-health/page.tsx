import { CheckCircle2, Database, FileText, ScrollText, Users as UsersIcon, XCircle } from "lucide-react";
import { requireSession } from "@/features/auth/session";
import { getBackendReadiness } from "@/features/health/api";
import { verifyAuditChain } from "@/features/audit/api";
import { getAllCurrentConfiguration } from "@/features/configuration/api";
import { CD_KEYS } from "@/features/configuration/types";
import { listUsers } from "@/features/users/api";
import { listTeams } from "@/features/teams/api";
import { ApiError } from "@/lib/backend-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Real version of what the "system health telemetry" mockup was reaching for — that mockup
 * modeled a 14-node Kubernetes cluster with fake pods (`efims-auth-enclave`,
 * `mule-detection-heuristics`, ...), a fake HSM, a fake service mesh, and fake CPU/RAM/IOPS
 * metrics. None of that exists: EFIMS is a NestJS modular monolith (see `docs/architecture.md`),
 * not microservices, and this codebase has no real metrics-collection infrastructure anywhere.
 * What's actually real and worth showing instead: is the API/database reachable right now (the
 * same `GET /health/ready` a real uptime monitor would call), is the audit hash chain still
 * intact (a genuine tamper-evidence guarantee this system makes), and how much of CD-01..08 is
 * still an unratified working default (non-negotiable #9) — plus a couple of honest scale
 * numbers (real user/team counts, not fabricated "capacity %"). Nothing here is a number this
 * app can't actually produce.
 */
export default async function SystemHealthPage() {
  const { accessToken } = await requireSession();

  const [readiness, auditChain, configuration, users, teams] = await Promise.all([
    getBackendReadiness().catch((err: unknown) => ({ failed: true, detail: err instanceof ApiError ? err.details : null })),
    verifyAuditChain(accessToken).catch(() => null),
    getAllCurrentConfiguration(accessToken),
    listUsers(accessToken),
    listTeams(accessToken),
  ]);

  const databaseUp = "failed" in readiness ? false : readiness.info?.database?.status === "up";
  const ratifiedCount = CD_KEYS.filter((key) => configuration[key]?.status === "RATIFIED").length;
  const draftKeys = CD_KEYS.filter((key) => configuration[key]?.status !== "RATIFIED");

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold text-on-surface">System health</h1>
        <p className="mt-1 text-xs text-on-surface-variant">
          Live status of the API, database, and audit trail.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="rounded-xl border-outline-variant/60 shadow-card">
          <CardHeader><CardTitle className="flex items-center gap-2 text-sm font-bold text-on-surface"><Database size={16} className="text-tertiary" />API &amp; database</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-xs">
            <StatusRow ok={true} label="Backend process reachable" detail="This page loaded, so it is." />
            <StatusRow
              ok={databaseUp}
              label="Database reachable"
              detail={databaseUp ? "A real SELECT 1 against Postgres just succeeded." : "GET /health/ready reported the database as unreachable."}
            />
          </CardContent>
        </Card>

        <Card className="rounded-xl border-outline-variant/60 shadow-card">
          <CardHeader><CardTitle className="flex items-center gap-2 text-sm font-bold text-on-surface"><ScrollText size={16} className="text-tertiary" />Audit ledger integrity</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-xs">
            {auditChain === null ? (
              <p className="text-on-surface-variant">Unable to verify the chain right now (see Audit for details).</p>
            ) : (
              <>
                <StatusRow
                  ok={auditChain.intact}
                  label={auditChain.intact ? "Hash chain intact" : `${auditChain.breaks.length} break(s) found`}
                  detail={`${auditChain.eventsChecked} audit event(s) checked.`}
                />
                {!auditChain.intact && (
                  <ul className="list-disc space-y-0.5 pl-4 text-on-surface-variant">
                    {auditChain.breaks.slice(0, 5).map((b, i) => (
                      <li key={i}>{b.action} on {b.entityType} {b.entityId} — {b.reason}</li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-xl border-outline-variant/60 shadow-card">
          <CardHeader><CardTitle className="flex items-center gap-2 text-sm font-bold text-on-surface"><FileText size={16} className="text-tertiary" />Configuration governance</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-xs">
            <StatusRow
              ok={ratifiedCount === CD_KEYS.length}
              label={`${ratifiedCount} of ${CD_KEYS.length} CD values ratified`}
              detail="Non-negotiable #9: unratified values are working defaults, never policy."
            />
            {draftKeys.length > 0 && (
              <ul className="list-disc space-y-0.5 pl-4 text-on-surface-variant">
                {draftKeys.map((key) => (
                  <li key={key}>{key.replaceAll("_", " ")}</li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-xl border-outline-variant/60 shadow-card">
          <CardHeader><CardTitle className="flex items-center gap-2 text-sm font-bold text-on-surface"><UsersIcon size={16} className="text-tertiary" />Tenant scale</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-xs text-on-surface-variant">
            <p>{users.length} active user{users.length === 1 ? "" : "s"}</p>
            <p>{teams.length} team{teams.length === 1 ? "" : "s"} configured</p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function StatusRow({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div className="flex items-start gap-2">
      {ok ? <CheckCircle2 size={16} strokeWidth={2} className="mt-0.5 shrink-0 text-tertiary" /> : <XCircle size={16} strokeWidth={2} className="mt-0.5 shrink-0 text-error" />}
      <div>
        <p className="font-semibold text-on-surface">{label}</p>
        <p className="text-on-surface-variant">{detail}</p>
      </div>
    </div>
  );
}
