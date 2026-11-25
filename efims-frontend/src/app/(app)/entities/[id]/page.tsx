import Link from "next/link";
import { Network, Trash2, ShieldAlert, Fingerprint } from "lucide-react";
import { requireSession } from "@/features/auth/session";
import { getEntity, listEntities } from "@/features/entities/api";
import { listCases } from "@/features/cases/api";
import { RISK_BAND_LABEL, RISK_BAND_COLOR } from "@/features/entities/types";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/shell/submit-button";
import {
  addIdentifierAction,
  addRelationshipAction,
  deleteEntityAction,
  linkCaseAction,
  recordRiskAssessmentAction,
  removeRelationshipAction,
  setWatchlistAction,
  unlinkCaseAction,
  updateEntityAction,
} from "@/features/entities/actions";
import { RelationshipForm } from "./relationship-form";
import { CaseLinkForm } from "./case-link-form";
import { RiskAssessmentForm } from "./risk-assessment-form";
import { WatchlistForm } from "./watchlist-form";
import { IdentifierForm } from "./identifier-form";

export default async function EntityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { accessToken } = await requireSession();

  const [entity, allEntities, caseList] = await Promise.all([
    getEntity(accessToken, id),
    listEntities({ accessToken }),
    listCases({ accessToken, limit: 100 }),
  ]);

  const relationshipCandidates = allEntities.filter((e) => e.id !== id);
  const entityById = new Map(allEntities.map((e) => [e.id, e]));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-on-surface">{entity.displayName}</h1>
            <Badge variant="outline">{entity.type}</Badge>
            {entity.watchlisted && (
              <Badge variant="destructive" className="gap-1">
                <ShieldAlert size={10} />
                Watchlisted
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-on-surface-variant">Created {new Date(entity.createdAt).toLocaleString()}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link
            href={`/network-graph?entityId=${entity.id}`}
            className="flex items-center gap-1.5 rounded-lg border border-outline-variant px-3 py-2 text-xs font-bold hover:bg-surface-container"
          >
            <Network size={14} strokeWidth={2} />
            View in Network Graph
          </Link>
          <form action={deleteEntityAction.bind(null, entity.id)}>
            <SubmitButton variant="outline" size="icon" aria-label="Delete entity" pendingText="">
              <Trash2 size={14} strokeWidth={2} />
            </SubmitButton>
          </form>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="space-y-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-card">
          <h2 className="text-sm font-bold text-on-surface">Identity</h2>
          <form action={updateEntityAction.bind(null, entity.id)} className="flex items-end gap-2">
            <div className="flex-1">
              <Label className="mb-1 text-[10px] font-bold uppercase">Name</Label>
              <Input name="displayName" defaultValue={entity.displayName} required />
            </div>
            <SubmitButton size="sm" variant="outline">Save</SubmitButton>
          </form>

          <div className="space-y-1.5 border-t border-outline-variant pt-3">
            {entity.identifiers.map((idf) => (
              <div key={idf.id} className="flex items-center gap-2 text-xs">
                <Fingerprint size={12} strokeWidth={2} className="text-on-surface-variant" />
                <span className="font-semibold">{idf.type}</span>
                <span className="font-mono text-on-surface-variant">{idf.value}</span>
                {idf.verified && <Badge variant="outline" className="text-[9px]">Verified</Badge>}
              </div>
            ))}
            {entity.identifiers.length === 0 && <p className="text-xs text-on-surface-variant">No identifiers recorded yet.</p>}
          </div>
          <IdentifierForm action={addIdentifierAction.bind(null, entity.id)} />
        </section>

        <section className="space-y-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-card">
          <h2 className="text-sm font-bold text-on-surface">Watchlist</h2>
          <p className="text-xs text-on-surface-variant">
            A manual, audited flag with a required reason, not a live sanctions-registry sync (no such integration
            exists).
          </p>
          <WatchlistForm watchlisted={entity.watchlisted} reason={entity.watchlistReason} action={setWatchlistAction.bind(null, entity.id)} />
        </section>

        <section className="space-y-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-card lg:col-span-2">
          <h2 className="text-sm font-bold text-on-surface">Relationships</h2>
          <div className="space-y-1.5">
            {entity.relationships.map((rel) => {
              const otherId = rel.fromEntityId === entity.id ? rel.toEntityId : rel.fromEntityId;
              const other = entityById.get(otherId);
              const direction = rel.fromEntityId === entity.id ? "→" : "←";
              return (
                <div key={rel.id} className="flex items-center justify-between rounded-lg border border-outline-variant px-3 py-2 text-xs">
                  <span>
                    <span className="font-semibold">{rel.relationshipType.replace(/_/g, " ")}</span> {direction}{" "}
                    <Link href={other ? `/entities/${other.id}` : "#"} className="font-semibold text-primary hover:underline">
                      {other?.displayName ?? otherId}
                    </Link>
                    {rel.rationale && <span className="text-on-surface-variant"> ({rel.rationale})</span>}
                  </span>
                  <form action={removeRelationshipAction.bind(null, entity.id, rel.id)}>
                    <SubmitButton variant="ghost" size="sm" pendingText="…">Remove</SubmitButton>
                  </form>
                </div>
              );
            })}
            {entity.relationships.length === 0 && <p className="text-xs text-on-surface-variant">No relationships recorded yet.</p>}
          </div>
          <div className="border-t border-outline-variant pt-3">
            <RelationshipForm candidates={relationshipCandidates} action={addRelationshipAction.bind(null, entity.id)} />
          </div>
        </section>

        <section className="space-y-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-card lg:col-span-2">
          <h2 className="text-sm font-bold text-on-surface">Linked cases</h2>
          <p className="text-xs text-on-surface-variant">
            Only cases you have access to are shown here. A case in a compartment you&apos;re not granted is omitted
            entirely, never shown redacted.
          </p>
          <div className="space-y-1.5">
            {entity.caseLinks.map((link) => (
              <div key={link.caseId} className="flex items-center justify-between rounded-lg border border-outline-variant px-3 py-2 text-xs">
                <span>
                  <Badge variant="outline" className="mr-2">{link.role}</Badge>
                  <Link href={`/cases/${link.caseId}`} className="font-semibold text-primary hover:underline">
                    {link.referenceCode}
                  </Link>{": "}
                  {link.title}
                </span>
                <form action={unlinkCaseAction.bind(null, entity.id, link.caseId)}>
                  <SubmitButton variant="ghost" size="sm" pendingText="…">Unlink</SubmitButton>
                </form>
              </div>
            ))}
            {entity.caseLinks.length === 0 && <p className="text-xs text-on-surface-variant">Not linked to any case you can access.</p>}
          </div>
          <div className="border-t border-outline-variant pt-3">
            <CaseLinkForm cases={caseList.cases} action={linkCaseAction.bind(null, entity.id)} />
          </div>
        </section>

        <section className="space-y-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-card lg:col-span-2">
          <h2 className="text-sm font-bold text-on-surface">Risk assessment history</h2>
          <p className="text-xs text-on-surface-variant">
            Analyst-entered, append-only, never a named proprietary model. Band reuses the same S1-S4 severity scale
            used across the rest of EFIMS.
          </p>
          <div className="space-y-2">
            {entity.riskAssessments.map((ra) => (
              <div key={ra.id} className="rounded-lg border border-outline-variant p-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: RISK_BAND_COLOR[ra.band] }} />
                  <span className="font-bold">{RISK_BAND_LABEL[ra.band]}</span>
                  <span className="text-on-surface-variant">{new Date(ra.assessedAt).toLocaleString()}</span>
                </div>
                <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-on-surface-variant">
                  {ra.factors.map((f, i) => (
                    <li key={i}>
                      {f.label} ({f.weight}): {f.rationale}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {entity.riskAssessments.length === 0 && <p className="text-xs text-on-surface-variant">No risk assessment recorded yet.</p>}
          </div>
          <div className="border-t border-outline-variant pt-3">
            <RiskAssessmentForm action={recordRiskAssessmentAction.bind(null, entity.id)} />
          </div>
        </section>
      </div>
    </div>
  );
}
