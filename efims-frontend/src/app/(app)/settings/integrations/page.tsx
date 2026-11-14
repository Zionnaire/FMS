const SOURCE_SYSTEMS = [
  { name: "Core banking", icon: "account_balance", note: "Account freeze / card block requests (containment) have no real downstream integration yet — EFIMS only requests and waits for confirmation." },
  { name: "Cards & payments processor", icon: "credit_card", note: "Same containment-request seam as core banking — no live connector." },
  { name: "SIEM", icon: "security", note: "No inbound signal ingestion from a real SIEM yet; signals are logged manually or via the signal-intake form." },
  { name: "AML transaction monitoring", icon: "monitoring", note: "No live alert feed; AML-flagged signals are logged the same way as any other signal source." },
  { name: "HRIS", icon: "badge", note: "No employee-directory sync; HR-compartment case subjects are entered manually." },
  { name: "Notification channels (email/SMS)", icon: "forward_to_inbox", note: "In-app notifications are real and live; external email/SMS delivery is not wired to any provider yet." },
] as const;

/** Honest "not connected" status page — matches `docs/OPEN_ITEMS.md`'s already-documented gap
 * ("no real external system integration"). No backend call here: there is nothing to query,
 * because nothing is connected. This page exists so that absence is stated plainly rather than
 * silently omitted — the same standing rule this project applies everywhere else (never claim a
 * connection, a ratified value, or a number that isn't real). */
export default function IntegrationsPage() {
  return (
    <>
      <div>
        <h1 className="font-headline text-2xl font-semibold text-primary">Integrations</h1>
        <p className="mt-1 text-xs text-on-surface-variant">
          No external system integration exists yet in this build. Every source system below is listed honestly as not connected.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {SOURCE_SYSTEMS.map((system) => (
          <div key={system.name} className="flex flex-col justify-between rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-5 shadow-card">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="rounded-xl bg-surface-container p-2 text-on-surface-variant">
                  <span className="material-symbols-outlined text-base">{system.icon}</span>
                </span>
                <span className="text-sm font-semibold text-on-surface">{system.name}</span>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-error-container px-2.5 py-1 text-[11px] font-bold text-on-error-container">
                <span className="material-symbols-outlined text-sm">link_off</span>
                Not connected
              </span>
            </div>
            <p className="mt-3 text-xs text-on-surface-variant">{system.note}</p>
          </div>
        ))}
      </div>
    </>
  );
}
