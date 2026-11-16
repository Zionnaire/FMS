import { Landmark, CreditCard, ShieldAlert, Activity, BadgeCheck, Mail, Unlink, type LucideIcon } from "lucide-react";

const SOURCE_SYSTEMS: { name: string; icon: LucideIcon; note: string }[] = [
  { name: "Core banking", icon: Landmark, note: "Account freeze / card block requests (containment) have no real downstream integration yet — EFIMS only requests and waits for confirmation." },
  { name: "Cards & payments processor", icon: CreditCard, note: "Same containment-request seam as core banking — no live connector." },
  { name: "SIEM", icon: ShieldAlert, note: "No inbound signal ingestion from a real SIEM yet; signals are logged manually or via the signal-intake form." },
  { name: "AML transaction monitoring", icon: Activity, note: "No live alert feed; AML-flagged signals are logged the same way as any other signal source." },
  { name: "HRIS", icon: BadgeCheck, note: "No employee-directory sync; HR-compartment case subjects are entered manually." },
  { name: "Notification channels (email/SMS)", icon: Mail, note: "In-app notifications are real and live; external email/SMS delivery is not wired to any provider yet." },
];

/** Honest "not connected" status page — matches `docs/OPEN_ITEMS.md`'s already-documented gap
 * ("no real external system integration"). No backend call here: there is nothing to query,
 * because nothing is connected. This page exists so that absence is stated plainly rather than
 * silently omitted — the same standing rule this project applies everywhere else (never claim a
 * connection, a ratified value, or a number that isn't real). */
export default function IntegrationsPage() {
  return (
    <>
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Integrations</h1>
        <p className="mt-1 text-xs text-on-surface-variant">
          No external system integration exists yet in this build. Every source system below is listed honestly as not connected.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {SOURCE_SYSTEMS.map((system) => {
          const Icon = system.icon;
          return (
            <div key={system.name} className="flex flex-col justify-between rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-card">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="rounded-lg bg-surface-container p-2 text-on-surface-variant">
                    <Icon size={18} strokeWidth={2} />
                  </span>
                  <span className="text-sm font-semibold text-on-surface">{system.name}</span>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-error-container px-2.5 py-1 text-[11px] font-bold text-on-error-container">
                  <Unlink size={14} strokeWidth={2} />
                  Not connected
                </span>
              </div>
              <p className="mt-3 text-xs text-on-surface-variant">{system.note}</p>
            </div>
          );
        })}
      </div>
    </>
  );
}
