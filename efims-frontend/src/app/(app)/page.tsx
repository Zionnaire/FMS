import Link from "next/link";
import { requireSession } from "@/features/auth/session";
import { listIncidents } from "@/features/incidents/api";
import { QueueDashboard } from "@/components/dashboards/queue-dashboard";
import { ExecutiveDashboard } from "@/components/dashboards/executive-dashboard";
import { ReporterDashboard } from "@/components/dashboards/reporter-dashboard";
import { AdminDashboard } from "@/components/dashboards/admin-dashboard";
import { ConfigAdminDashboard } from "@/components/dashboards/config-admin-dashboard";
import { DASHBOARD_LOADERS } from "@/lib/dashboard-loaders";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Thin per-role dispatcher (added 2026-10-14 alongside the 20-role expansion — see
 * docs/CHANGELOG.md's dated entry for the full matrix). `requireSession()` is still the one real
 * per-page auth gate, same as every other page; everything below it is "which dashboard does
 * this role see," not a second authorization layer — a role seeing the wrong DASHBOARD is a UX
 * bug, not a security one, since every backend call each dashboard makes is independently
 * access-filtered regardless of what's rendered here.
 */
export default async function DashboardPage() {
  const { accessToken, user } = await requireSession();

  switch (user.role) {
    case "EXECUTIVE":
      return <ExecutiveDashboard accessToken={accessToken} />;
    case "INCIDENT_REPORTER":
      return <ReporterDashboard accessToken={accessToken} />;
    case "ADMIN":
      return <AdminDashboard accessToken={accessToken} />;
    case "CONFIG_ADMIN":
      return <ConfigAdminDashboard accessToken={accessToken} />;
  }

  const loader = DASHBOARD_LOADERS[user.role];
  if (loader) {
    const data = await loader(accessToken, user);
    return <QueueDashboard data={data} />;
  }

  // Defensive fallback only — every one of the 20 roles is handled by one of the two branches
  // above; this keeps the page from throwing if that ever drifts out of sync.
  const [openIncidents, underReview] = await Promise.all([
    listIncidents({ accessToken, status: "OPEN", limit: 1 }),
    listIncidents({ accessToken, status: "UNDER_REVIEW", limit: 1 }),
  ]);
  return (
    <>
      <div>
        <h1 className="font-headline text-2xl font-semibold text-primary">Good day.</h1>
        <p className="mt-1 text-xs text-on-surface-variant">
          Signed in as <span className="font-semibold text-on-surface">{user.role.replaceAll("_", " ")}</span>.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="border-outline-variant shadow-card">
          <CardHeader><CardTitle className="text-[11px] font-bold tracking-wider text-on-surface-variant uppercase">Open incidents</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-extrabold tracking-tight text-on-surface">{openIncidents.total}</p></CardContent>
        </Card>
        <Card className="border-outline-variant shadow-card">
          <CardHeader><CardTitle className="text-[11px] font-bold tracking-wider text-on-surface-variant uppercase">Under review</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-extrabold tracking-tight text-on-surface">{underReview.total}</p></CardContent>
        </Card>
        <Card className="border-outline-variant bg-primary-container text-on-primary shadow-card">
          <CardHeader><CardTitle className="text-[11px] font-bold tracking-wider text-on-primary-container uppercase">Quick action</CardTitle></CardHeader>
          <CardContent>
            <Link href="/incidents" className="text-sm font-semibold underline decoration-on-primary/40 underline-offset-4">
              Review the incident queue →
            </Link>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
