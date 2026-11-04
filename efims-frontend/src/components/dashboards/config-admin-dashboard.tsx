import Link from "next/link";
import { getAllCurrentConfiguration } from "@/features/configuration/api";
import { CD_KEYS } from "@/features/configuration/types";
import { StatusBadge } from "@/components/shell/status-badge";

/** Configuration Administrator/Governance Owner's "Configuration governance" — bespoke: a
 * register of all 8 CD keys and their ratification state, not a case/incident queue.
 * `getAllCurrentConfiguration` only returns a key if it has a RATIFIED version — per CLAUDE.md
 * non-negotiable #9, every CD-01..08 value is still a working default today, so this honestly
 * shows 0 of 8 ratified rather than inventing a "ratified" status nothing has actually earned. */
export async function ConfigAdminDashboard({ accessToken }: { accessToken: string }) {
  const current = await getAllCurrentConfiguration(accessToken);
  const ratifiedCount = Object.keys(current).length;

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-headline text-2xl font-semibold text-primary">Configuration governance</h1>
          <p className="mt-1 text-xs text-on-surface-variant">{ratifiedCount} of {CD_KEYS.length} CD values ratified.</p>
        </div>
        <Link
          href="/configuration"
          className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-xs font-semibold text-on-primary shadow-card transition-all hover:bg-primary-container"
        >
          <span className="material-symbols-outlined text-base">tune</span>
          Open register
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col justify-between rounded-2xl border border-primary/20 bg-primary-container p-5 text-on-primary shadow-hero">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-secondary-fixed uppercase">Ratified</span>
            <span className="material-symbols-outlined text-secondary-fixed">verified</span>
          </div>
          <div className="mt-3 font-headline text-3xl font-bold text-surface-bright">{ratifiedCount} / {CD_KEYS.length}</div>
        </div>
        <div className="flex flex-col justify-between rounded-2xl border border-error/30 bg-error-container/20 p-5 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-error uppercase">Pending ratification</span>
            <span className="material-symbols-outlined text-error">hourglass_top</span>
          </div>
          <div className="mt-3 font-headline text-3xl font-bold text-error">{CD_KEYS.length - ratifiedCount}</div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-card">
        <div className="border-b border-outline-variant/30 bg-surface-container-low px-5 py-3">
          <h2 className="text-sm font-bold text-on-surface">CD-01..CD-08 register</h2>
        </div>
        <ul className="divide-y divide-outline-variant/20">
          {CD_KEYS.map((key) => {
            const entry = current[key];
            return (
              <li key={key}>
                <Link href={`/configuration/${key}`} className="flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-surface-container-low/60">
                  <span className="font-mono text-xs font-semibold text-on-surface">{key}</span>
                  <div className="flex items-center gap-3">
                    {entry && <span className="text-xs text-on-surface-variant">v{entry.version}</span>}
                    <StatusBadge status={entry ? "RATIFIED" : "DRAFT"} tone={entry ? "positive" : "warning"} />
                    <span className="material-symbols-outlined text-base text-outline">chevron_right</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}
