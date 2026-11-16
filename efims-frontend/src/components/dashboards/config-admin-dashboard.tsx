import Link from "next/link";
import { SlidersHorizontal, BadgeCheck, Hourglass, ChevronRight } from "lucide-react";
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
          <h1 className="text-2xl font-bold text-on-surface">Configuration governance</h1>
          <p className="mt-1 text-xs text-on-surface-variant">{ratifiedCount} of {CD_KEYS.length} CD values ratified.</p>
        </div>
        <Link
          href="/configuration"
          className="flex items-center gap-2 rounded-lg bg-tertiary px-5 py-2.5 text-xs font-semibold text-on-tertiary shadow-card transition-colors hover:bg-tertiary/90"
        >
          <SlidersHorizontal size={16} strokeWidth={2} />
          Open register
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-card">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--color-success) 16%, white)" }}>
              <BadgeCheck size={20} strokeWidth={2} className="text-success" />
            </span>
            <span className="text-xs font-semibold text-on-surface-variant">Ratified</span>
          </div>
          <span className="text-[28px] leading-none font-bold text-on-surface">{ratifiedCount} / {CD_KEYS.length}</span>
        </div>
        <div className="flex flex-col gap-3 rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-card">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--color-error) 16%, white)" }}>
              <Hourglass size={20} strokeWidth={2} className="text-error" />
            </span>
            <span className="text-xs font-semibold text-on-surface-variant">Pending ratification</span>
          </div>
          <span className="text-[28px] leading-none font-bold text-on-surface">{CD_KEYS.length - ratifiedCount}</span>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-outline-variant/60 bg-surface-container-lowest shadow-card">
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
                    <ChevronRight size={16} className="text-outline" />
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
