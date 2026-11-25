import type { Metadata } from "next";
import { listTenants } from "@/features/platform/api";
import { updateTenantStatusAction } from "@/features/platform/actions";
import { requirePlatformSession } from "@/features/platform/session";
import { StatusBadge } from "@/components/shell/status-badge";
import { CreateTenantForm } from "./create-tenant-form";

export const metadata: Metadata = {
  title: "Tenants | EFIMS Platform",
};

/** The platform's one real page: list every bank tenant (with real per-tenant case/user counts —
 * `TenantsAdminService.list()` computes these the same cross-tenant way `SlaClockService`'s
 * breach-sweep cron already does, not a fabricated number), provision a new one, suspend/
 * reactivate an existing one. */
export default async function PlatformDashboardPage() {
  const { accessToken } = await requirePlatformSession();
  const tenants = await listTenants(accessToken);

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Tenants</h1>
        <p className="mt-1 text-xs text-on-surface-variant">{tenants.length} bank tenant{tenants.length === 1 ? "" : "s"} on this platform.</p>
      </div>

      <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-6 shadow-card">
        <h2 className="mb-4 text-sm font-bold text-on-surface">Provision a new tenant</h2>
        <CreateTenantForm />
      </div>

      <div className="overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-card">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-outline-variant/30 bg-surface-container-low text-xs text-on-surface-variant uppercase">
              <th className="px-5 py-3 font-semibold">Tenant</th>
              <th className="px-5 py-3 font-semibold">Slug</th>
              <th className="px-5 py-3 font-semibold">Cases</th>
              <th className="px-5 py-3 font-semibold">Users</th>
              <th className="px-5 py-3 font-semibold">Status</th>
              <th className="px-5 py-3 text-center font-semibold">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/20">
            {tenants.map((t) => (
              <tr key={t.id}>
                <td className="px-5 py-3 font-medium text-on-surface">{t.name}</td>
                <td className="px-5 py-3 font-mono text-xs text-on-surface-variant">{t.slug}</td>
                <td className="px-5 py-3 text-on-surface-variant">{t.caseCount}</td>
                <td className="px-5 py-3 text-on-surface-variant">{t.userCount}</td>
                <td className="px-5 py-3">
                  <StatusBadge status={t.status} tone={t.status === "ACTIVE" ? "positive" : "critical"} />
                </td>
                <td className="px-5 py-3 text-center">
                  <form
                    action={async () => {
                      "use server";
                      await updateTenantStatusAction(t.id, t.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE");
                    }}
                  >
                    <button type="submit" className="rounded-full border border-outline-variant px-3 py-1 text-xs font-medium text-on-surface-variant transition-colors hover:bg-surface-container-low">
                      {t.status === "ACTIVE" ? "Suspend" : "Reactivate"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
