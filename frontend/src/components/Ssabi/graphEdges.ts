import type { GraphEdge } from '../../types';
import type { Point } from './graphLayout';

/** Stable row identity; canonical endpoint order says nothing about semantic direction. */
export function graphEdgeKey(edge: GraphEdge): string {
  if (edge.id) return `id:${edge.id}`;
  return JSON.stringify([
    'edge',
    edge.source,
    edge.target,
    edge.label,
    edge.established_page,
    edge.semantics?.relation_key ?? null,
    edge.semantics?.kind ?? null,
    edge.semantics?.direction ?? null,
    edge.semantics?.assertion_status ?? null,
    edge.semantics?.state ?? null,
  ]);
}

/** FR-CHR-001: independent relationships and event occurrences never replace each other. */
export function graphTrackKey(edge: GraphEdge): string {
  const pair = [edge.source, edge.target].sort();
  const semantics = edge.semantics;
  if (!semantics) return JSON.stringify(['legacy', ...pair]);

  let direction = semantics.direction;
  if (pair[0] !== edge.source) {
    if (direction === 'a_to_b') direction = 'b_to_a';
    else if (direction === 'b_to_a') direction = 'a_to_b';
  }
  return JSON.stringify([
    'semantic',
    ...pair,
    direction,
    semantics.kind,
    semantics.relation_key,
    semantics.temporal_scope === 'event' ? (edge.id ?? edge.established_page) : null,
  ]);
}

/** NFR-USE-006: uncertainty, denial and time are stated in text, not color alone. */
export function graphEdgeLabel(edge: GraphEdge): string {
  const semantics = edge.semantics;
  if (!semantics) return edge.label;
  const status = {
    fact: '',
    belief: '믿음',
    claim: '주장',
    rumor: '소문',
    uncertain: '불확실',
    negated: '부정됨',
  }[semantics.assertion_status];
  return [
    edge.label,
    status && `(${status})`,
    semantics.temporal_scope === 'event' && '(사건)',
    semantics.state === 'ended' && '(종료)',
  ]
    .filter(Boolean)
    .join(' ');
}

export interface EdgePath {
  edge: GraphEdge;
  key: string;
  path: string;
  label: Point;
  length: number;
}

/**
 * Each unordered pair gets stable parallel lanes. The path always runs source → target;
 * the renderer applies start/end markers from semantics.direction independently.
 * radiusFor includes any marker clearance needed outside the visible node circle.
 */
export function makeEdgePaths(
  nodes: readonly { id: string }[],
  edges: readonly GraphEdge[],
  positions: readonly Point[],
  radiusFor: (id: string) => number,
  gap: number
): EdgePath[] {
  const points = new Map(nodes.map((node, index) => [node.id, positions[index]]));
  const groups = new Map<string, GraphEdge[]>();
  for (const edge of edges) {
    const from = points.get(edge.source);
    const to = points.get(edge.target);
    if (!from || !to || ![from.x, from.y, to.x, to.y].every(Number.isFinite)) continue;
    const pair = JSON.stringify([edge.source, edge.target].sort());
    const group = groups.get(pair) ?? [];
    group.push(edge);
    groups.set(pair, group);
  }

  const result: EdgePath[] = [];
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => {
      const aKey = graphEdgeKey(a);
      const bKey = graphEdgeKey(b);
      return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
    });
    sorted.forEach((edge, index) => {
      const from = points.get(edge.source)!;
      const to = points.get(edge.target)!;
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const distance = Math.hypot(dx, dy);
      if (distance === 0) return;
      // Canonical orientation is used only to place lanes, never to infer arrows.
      const orientation = edge.source < edge.target ? 1 : -1;
      const offset = (index - (sorted.length - 1) / 2) * gap * orientation;
      const control = {
        x: (from.x + to.x) / 2 - (dy / distance) * offset,
        y: (from.y + to.y) / 2 + (dx / distance) * offset,
      };
      const start = outsideCircle(from, control, radiusFor(edge.source));
      const end = outsideCircle(to, control, radiusFor(edge.target));
      const label = quadraticPoint(start, control, end, 0.5);
      let length = 0;
      let previous = start;
      for (let step = 1; step <= 12; step += 1) {
        const point = quadraticPoint(start, control, end, step / 12);
        length += Math.hypot(point.x - previous.x, point.y - previous.y);
        previous = point;
      }
      result.push({
        edge,
        key: graphEdgeKey(edge),
        path: `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`,
        label,
        length,
      });
    });
  }
  return result;
}

function outsideCircle(center: Point, toward: Point, radius: number): Point {
  const length = Math.hypot(toward.x - center.x, toward.y - center.y) || 1;
  const safeRadius = Number.isFinite(radius) ? Math.max(0, radius) : 0;
  return {
    x: center.x + ((toward.x - center.x) / length) * safeRadius,
    y: center.y + ((toward.y - center.y) / length) * safeRadius,
  };
}

function quadraticPoint(start: Point, control: Point, end: Point, t: number): Point {
  const remaining = 1 - t;
  return {
    x: remaining * remaining * start.x + 2 * remaining * t * control.x + t * t * end.x,
    y: remaining * remaining * start.y + 2 * remaining * t * control.y + t * t * end.y,
  };
}
