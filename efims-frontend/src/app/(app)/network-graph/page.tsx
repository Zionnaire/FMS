import Link from "next/link";
import { Network } from "lucide-react";
import { requireSession } from "@/features/auth/session";
import { getEntityGraph, listEntities } from "@/features/entities/api";
import { EntityGraphLegend, EntityGraphView } from "@/components/graph/entity-graph";

export default async function NetworkGraphPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { accessToken } = await requireSession();
  const params = await searchParams;

  const entities = await listEntities({ accessToken });
  const centerEntityId = params.entityId && entities.some((e) => e.id === params.entityId) ? params.entityId : entities[0]?.id;
  const depth = params.depth ? Math.min(Math.max(Number(params.depth), 1), 4) : 2;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Network graph</h1>
        <p className="mt-1 text-xs text-on-surface-variant">
          Bounded-depth relationship traversal over recorded entity links: plain Postgres recursive queries, not a
          graph database. Click a node to re-center the graph on it.
        </p>
      </div>

      {!centerEntityId ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-outline-variant bg-surface-container-lowest p-12 text-center">
          <Network size={28} strokeWidth={1.5} className="text-on-surface-variant opacity-50" />
          <p className="text-sm text-on-surface-variant">No entities exist yet.</p>
          <Link href="/entities/new" className="text-xs font-semibold text-primary hover:underline">Create your first entity</Link>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-3">
            <form className="flex items-center gap-2">
              <label className="text-xs font-semibold text-on-surface-variant" htmlFor="entityId">Center on</label>
              <select
                id="entityId"
                name="entityId"
                defaultValue={centerEntityId}
                className="rounded-lg border border-outline-variant bg-surface px-2.5 py-1.5 text-xs"
              >
                {entities.map((e) => (
                  <option key={e.id} value={e.id}>{e.displayName} ({e.type})</option>
                ))}
              </select>
              <label className="ml-3 text-xs font-semibold text-on-surface-variant" htmlFor="depth">Hop depth</label>
              <select id="depth" name="depth" defaultValue={String(depth)} className="rounded-lg border border-outline-variant bg-surface px-2.5 py-1.5 text-xs">
                {[1, 2, 3, 4].map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              <button type="submit" className="rounded-lg border border-outline-variant px-3 py-1.5 text-xs font-semibold hover:bg-surface-container">
                Apply
              </button>
            </form>
            <EntityGraphLegend />
          </div>

          <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 shadow-card">
            <GraphForEntity accessToken={accessToken} entityId={centerEntityId} depth={depth} />
          </div>
        </>
      )}
    </div>
  );
}

async function GraphForEntity({ accessToken, entityId, depth }: { accessToken: string; entityId: string; depth: number }) {
  const graph = await getEntityGraph(accessToken, entityId, depth);
  return <EntityGraphView graph={graph} centerEntityId={entityId} />;
}
