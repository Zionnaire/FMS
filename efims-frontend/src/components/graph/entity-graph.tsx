"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation } from "d3-force";
import type { EntityGraph, EntityType, GraphNode } from "@/features/entities/types";

/** The plain-Postgres-backed network graph view — `d3-force` is the one new dependency this
 * feature adds (just the physics simulation, not all of d3), rendered through a hand-built SVG
 * component rather than a pre-styled graph-component library, matching this codebase's existing
 * "theme-token colors, no 3D/gradient flourish, defensive contrast" discipline already used for
 * every chart in `components/charts/` (see `trend-chart.tsx`'s own doc comment). No animated
 * fund-flow replay or "Total Flow Tracked" figure — there's no Transaction ledger behind this
 * (see docs/CHANGELOG.md's dated entry on what the mockup fabricated and what this drops). */

const TYPE_COLOR: Record<EntityType, string> = {
  PERSON: "var(--color-primary)",
  COMPANY: "var(--color-tertiary)",
  ACCOUNT: "var(--color-secondary)",
};

interface PositionedNode extends GraphNode {
  x: number;
  y: number;
}

interface SimNode extends GraphNode {
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

const WIDTH = 760;
const HEIGHT = 480;

export function EntityGraphView({ graph, centerEntityId }: { graph: EntityGraph; centerEntityId: string }) {
  const router = useRouter();

  /** A bounded-tick force layout is a pure, synchronous computation over `graph` — no external
   * system to subscribe to — so it belongs in `useMemo`, not an effect + `setState` (which would
   * just trigger an extra render for no benefit). */
  const positions = useMemo(() => {
    const simNodes: SimNode[] = graph.nodes.map((n) => ({ ...n }));
    const simLinks = graph.edges.map((e) => ({ source: e.fromEntityId, target: e.toEntityId, id: e.id }));

    const simulation = forceSimulation(simNodes)
      .force("charge", forceManyBody().strength(-220))
      .force("link", forceLink(simLinks).id((d: unknown) => (d as SimNode).id).distance(110))
      .force("center", forceCenter(WIDTH / 2, HEIGHT / 2))
      .force("collide", forceCollide().radius(34))
      .stop();

    for (let i = 0; i < 300; i++) simulation.tick();

    const result = new Map<string, PositionedNode>();
    for (const node of simNodes) {
      result.set(node.id, { ...node, x: node.x ?? WIDTH / 2, y: node.y ?? HEIGHT / 2 });
    }
    return result;
  }, [graph]);

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-auto w-full" role="img" aria-label="Entity relationship graph">
      {graph.edges.map((edge) => {
        const from = positions.get(edge.fromEntityId);
        const to = positions.get(edge.toEntityId);
        if (!from || !to) return null;
        const midX = (from.x + to.x) / 2;
        const midY = (from.y + to.y) / 2;
        const label = edge.relationshipType.replace(/_/g, " ");
        return (
          <g key={edge.id}>
            <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="var(--color-outline-variant)" strokeWidth={1.5} />
            <rect x={midX - label.length * 2.8} y={midY - 9} width={label.length * 5.6} height={12} rx={3} fill="var(--color-surface-container-lowest)" opacity={0.9} />
            <text x={midX} y={midY} fontSize={9} fill="var(--color-on-surface-variant)" textAnchor="middle" className="select-none">
              {label}
            </text>
          </g>
        );
      })}
      {[...positions.values()].map((node) => {
        const isCenter = node.id === centerEntityId;
        const radius = isCenter ? 22 : 16;
        return (
          <g
            key={node.id}
            transform={`translate(${node.x}, ${node.y})`}
            className="cursor-pointer"
            onClick={() => router.push(`/network-graph?entityId=${node.id}`)}
          >
            <circle
              r={radius}
              fill={TYPE_COLOR[node.type]}
              stroke={node.watchlisted ? "var(--color-error)" : "var(--color-surface-container-lowest)"}
              strokeWidth={node.watchlisted ? 3 : 2}
              opacity={isCenter ? 1 : 0.85}
            />
            <text y={radius + 13} fontSize={10} fontWeight={isCenter ? 700 : 500} fill="var(--color-on-surface)" textAnchor="middle" className="select-none">
              {node.displayName.length > 20 ? `${node.displayName.slice(0, 18)}…` : node.displayName}
            </text>
            {node.visibleCaseCount > 0 && (
              <text y={radius + 25} fontSize={9} fill="var(--color-on-surface-variant)" textAnchor="middle" className="select-none">
                {node.visibleCaseCount} case{node.visibleCaseCount === 1 ? "" : "s"}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function EntityGraphLegend() {
  return (
    <div className="flex flex-wrap items-center gap-4 text-[11px] text-on-surface-variant">
      {(Object.keys(TYPE_COLOR) as EntityType[]).map((type) => (
        <span key={type} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: TYPE_COLOR[type] }} />
          {type}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full border-2" style={{ borderColor: "var(--color-error)" }} />
        Watchlisted
      </span>
    </div>
  );
}
