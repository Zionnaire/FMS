import { Clock } from "lucide-react";
import { requireSession } from "@/features/auth/session";
import { getEvidenceRegister } from "@/features/evidence/api";
import { getConfigurationKeyDetail } from "@/features/configuration/api";
import { EvidenceTable } from "../../evidence/evidence-table";

/** Real register (every evidence item currently under legal hold, across every accessible case —
 * `GET /evidence?legalHold=true`, already built for the top-level Evidence register page), plus a
 * read-only summary of CD-05's retention schedule. CD-05's `value` is rendered generically
 * (key/value, not a bespoke schema this frontend doesn't actually know) — same "never fabricate
 * what a CD value contains" discipline as the rest of this app's configuration surface, and CD-05
 * is still unratified like every other CD (non-negotiable #9), reflected here via `current`
 * possibly being `null` rather than assumed. */
export default async function RetentionPage() {
  const { accessToken } = await requireSession();
  const [heldItems, cd05] = await Promise.all([
    getEvidenceRegister(accessToken, true),
    getConfigurationKeyDetail(accessToken, "CD_05_RETENTION_SCHEDULE"),
  ]);

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Retention &amp; legal holds</h1>
        <p className="mt-1 text-xs text-on-surface-variant">
          {heldItems.length} evidence item{heldItems.length === 1 ? "" : "s"} currently under legal hold across every case you can access.
        </p>
      </div>

      <div className="rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-card">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-on-surface">CD-05: retention schedule</h2>
          {!cd05.current && (
            <span className="rounded-full bg-error-container px-2.5 py-1 text-[11px] font-bold text-on-error-container">No ratified value yet</span>
          )}
        </div>
        {cd05.current ? (
          <>
            <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-secondary-container px-2.5 py-1 text-[11px] font-bold text-on-secondary-container">
              <Clock size={14} strokeWidth={2} />
              {cd05.current.status === "RATIFIED" ? "Ratified" : "Unratified working default"}, v{cd05.current.version}
            </span>
            <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {Object.entries(cd05.current.value).map(([k, v]) => (
                <div key={k} className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-3">
                  <dt className="text-[11px] font-semibold tracking-wide text-on-surface-variant uppercase">{k.replaceAll("_", " ")}</dt>
                  <dd className="mt-0.5 text-sm text-on-surface">{typeof v === "object" ? JSON.stringify(v) : String(v)}</dd>
                </div>
              ))}
            </dl>
          </>
        ) : (
          <p className="mt-2 text-sm text-on-surface-variant">
            No CD-05 draft has been created yet for this tenant. See Settings → Configuration.
          </p>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-outline-variant/60 bg-surface-container-lowest shadow-card">
        <div className="border-b border-outline-variant/20 bg-surface-container-low/40 px-5 py-3 text-xs text-on-surface-variant">
          Items under legal hold
        </div>
        <EvidenceTable items={heldItems} />
      </div>
    </>
  );
}
