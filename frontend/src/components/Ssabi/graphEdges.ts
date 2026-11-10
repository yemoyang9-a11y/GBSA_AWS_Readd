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

type Slot = 'a' | 'b';

/** 정렬된 두 인물과, 그 정렬에 맞춘 방향 */
function normalized(edge: GraphEdge) {
  const pair = [edge.source, edge.target].sort();
  let direction = edge.semantics?.direction;
  if (pair[0] !== edge.source) {
    if (direction === 'a_to_b') direction = 'b_to_a';
    else if (direction === 'b_to_a') direction = 'a_to_b';
  }
  return { pair, direction };
}

/**
 * FR-CHR-001: 서로 대체할 수 있는 관계 묶음. 방향은 묶음 키가 아니라 그 안의 관점 칸이다.
 * 서버 relationshipGroup(backend/src/modules/ssabi/relationship-versions.ts)과 같은 규칙.
 */
function graphGroupKey(edge: GraphEdge): string {
  const { pair } = normalized(edge);
  const s = edge.semantics;
  if (!s) return JSON.stringify(['legacy', ...pair]);
  return JSON.stringify([
    'semantic',
    ...pair,
    s.kind,
    s.relation_key,
    s.temporal_scope === 'event'
      ? [edge.established_page, s.evidence.start_char, s.evidence.end_char]
      : 'ongoing',
  ]);
}

/** 한쪽 방향은 그 관계를 가진 쪽 칸만, 쌍방·무방향·미확인·기존 관계는 양쪽 칸 */
function graphSlots(edge: GraphEdge): Slot[] {
  const { direction } = normalized(edge);
  return direction === 'a_to_b' ? ['a'] : direction === 'b_to_a' ? ['b'] : ['a', 'b'];
}

/**
 * FR-CHR-001: 묶음마다 페이지 순서로 칸을 채우고, 칸을 하나라도 빼앗긴 관계는 통째로 대체한다.
 * 한쪽→쌍방, 쌍방→한쪽, 미확인→확정은 새 관계만 남고 A→B와 B→A는 함께 남는다.
 * 서버 currentRelationshipVersions와 같은 규칙이다 — 이미 허용된 이력만 받는다.
 */
export function currentGraphEdges(edges: readonly GraphEdge[]): GraphEdge[] {
  const ordered = [...edges].sort(
    (x, y) =>
      x.established_page - y.established_page ||
      (graphEdgeKey(x) < graphEdgeKey(y) ? -1 : graphEdgeKey(x) > graphEdgeKey(y) ? 1 : 0)
  );
  const groups = new Map<string, Map<Slot, GraphEdge>>();
  for (const edge of ordered) {
    const key = graphGroupKey(edge);
    const slots = groups.get(key) ?? new Map<Slot, GraphEdge>();
    groups.set(key, slots);
    for (const slot of graphSlots(edge)) {
      const replaced = slots.get(slot);
      if (replaced) for (const [s, e] of [...slots]) if (e === replaced) slots.delete(s);
    }
    for (const slot of graphSlots(edge)) slots.set(slot, edge);
  }
  const current = new Set([...groups.values()].flatMap((slots) => [...slots.values()]));
  return ordered.filter((edge) => current.has(edge));
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
