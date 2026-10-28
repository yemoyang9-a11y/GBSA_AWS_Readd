import type { GraphEdge } from '../../types';
import { graphEdgeKey, graphEdgeLabel, graphTrackKey, makeEdgePaths } from './graphEdges';

const legacy: GraphEdge = {
  source: 'a',
  target: 'b',
  label: '지인',
  established_page: 4,
};

function relationship(id: string, overrides: Partial<GraphEdge['semantics']> = {}): GraphEdge {
  return {
    ...legacy,
    id,
    semantics: {
      version: 2,
      direction: 'a_to_b',
      kind: 'emotion',
      relation_key: id,
      summary: 'A는 B를 질투한다.',
      assertion_status: 'fact',
      temporal_scope: 'ongoing',
      state: 'active',
      evidence: { source_page: 4, quote: 'A는 B를 질투한다.', start_char: 0, end_char: 12 },
      ...overrides,
    },
  };
}

describe('graphEdgeKey / graphTrackKey', () => {
  it('keeps independent facts distinct and versions on the same semantic track', () => {
    const jealousy = relationship('jealousy-v1', { relation_key: 'jealousy' });
    const ended = {
      ...relationship('jealousy-v2', { relation_key: 'jealousy', state: 'ended' }),
      established_page: 8,
    };
    const mediation = relationship('mediation', { relation_key: 'mediation', kind: 'action' });

    expect(graphEdgeKey(jealousy)).not.toBe(graphEdgeKey(ended));
    expect(graphTrackKey(jealousy)).toBe(graphTrackKey(ended));
    expect(graphTrackKey(jealousy)).not.toBe(graphTrackKey(mediation));
    expect(graphTrackKey(jealousy)).toBe(
      graphTrackKey({
        ...jealousy,
        source: 'b',
        target: 'a',
        semantics: { ...jealousy.semantics!, direction: 'b_to_a' },
      })
    );
    expect(graphTrackKey(jealousy)).not.toBe(
      graphTrackKey({
        ...jealousy,
        semantics: { ...jealousy.semantics!, direction: 'b_to_a' },
      })
    );
    expect(graphTrackKey(jealousy)).not.toBe(
      graphTrackKey({
        ...jealousy,
        semantics: { ...jealousy.semantics!, kind: 'social' },
      })
    );
  });

  it('keeps separate events rather than replacing the earlier occurrence', () => {
    const first = relationship('rescue-1', { temporal_scope: 'event', relation_key: 'rescue' });
    const next = { ...first, id: 'rescue-2', established_page: 9 };
    expect(graphTrackKey(first)).not.toBe(graphTrackKey(next));
    expect(graphTrackKey({ ...first, id: undefined })).not.toBe(
      graphTrackKey({ ...next, id: undefined })
    );
  });

  it('does not collide when legacy labels, dates, or delimiter-bearing IDs differ', () => {
    const edges = [
      legacy,
      { ...legacy, label: '중매' },
      { ...legacy, established_page: 5 },
      { ...legacy, source: 'a-b', target: 'c' },
      { ...legacy, source: 'a', target: 'b-c' },
    ];
    expect(new Set(edges.map(graphEdgeKey)).size).toBe(edges.length);
    expect(graphTrackKey(legacy)).toBe(
      graphTrackKey({ ...legacy, label: '연인', established_page: 10 })
    );
  });
});

describe('makeEdgePaths', () => {
  const nodes = [{ id: 'a' }, { id: 'b' }];
  const positions = [
    { x: 0, y: 0 },
    { x: 200, y: 0 },
  ];

  it('draws stable, distinct curves for parallel facts even when response order changes', () => {
    const first = relationship('jealousy');
    const second = relationship('mediation', { kind: 'action' });
    const normal = makeEdgePaths(nodes, [first, second], positions, () => 10, 70);
    const reversed = makeEdgePaths(nodes, [second, first], positions, () => 10, 70);
    const byKey = (paths: typeof normal) =>
      Object.fromEntries(paths.map((entry) => [entry.key, entry.path]));

    expect(normal).toHaveLength(2);
    expect(new Set(normal.map((entry) => entry.path)).size).toBe(2);
    expect(normal[0].label.y * normal[1].label.y).toBeLessThan(0);
    expect(byKey(normal)).toEqual(byKey(reversed));
  });

  it('preserves supplied endpoint orientation regardless of lexical order or semantic direction', () => {
    const reverse = {
      ...relationship('reverse', { direction: 'b_to_a' }),
      source: 'b',
      target: 'a',
    };
    const [path] = makeEdgePaths(nodes, [reverse], positions, () => 10, 70);

    // The renderer assigns a start marker for b_to_a; geometry must not reorder endpoints.
    expect(path.path).toBe('M 190 0 Q 100 0 10 0');
    expect(path.edge).toBe(reverse);
    expect(path.label).toEqual({ x: 100, y: 0 });
  });

  it('keeps opposite endpoint orders on separate geometric lanes', () => {
    const forward = relationship('forward');
    const backward = { ...relationship('backward'), source: 'b', target: 'a' };
    const paths = makeEdgePaths(nodes, [forward, backward], positions, () => 10, 70);
    expect(paths).toHaveLength(2);
    expect(paths[0].label.y * paths[1].label.y).toBeLessThan(0);
  });

  it('clips curved endpoints at the supplied radius so arrowheads stay outside nodes', () => {
    const paths = makeEdgePaths(
      nodes,
      [relationship('one'), relationship('two')],
      positions,
      (id) => (id === 'a' ? 18 : 24),
      70
    );
    for (const entry of paths) {
      const values = entry.path.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/g)!.map(Number);
      const [startX, startY, , , endX, endY] = values;
      expect(Math.hypot(startX, startY)).toBeCloseTo(18);
      expect(Math.hypot(endX - 200, endY)).toBeCloseTo(24);
      expect(entry.length).toBeGreaterThan(150);
    }
  });

  it('ignores dangling endpoints rather than emitting invalid SVG coordinates', () => {
    const paths = makeEdgePaths(
      nodes,
      [legacy, { ...legacy, target: 'missing' }],
      positions,
      () => 10,
      70
    );
    expect(paths).toHaveLength(1);
    expect(paths[0].path).not.toMatch(/NaN|undefined/);
  });
});

describe('graphEdgeLabel', () => {
  it.each([
    ['belief', '믿음'],
    ['claim', '주장'],
    ['rumor', '소문'],
    ['uncertain', '불확실'],
    ['negated', '부정됨'],
  ] as const)(
    'marks %s explicitly instead of asserting the label as fact',
    (assertion_status, text) => {
      expect(graphEdgeLabel(relationship('r', { assertion_status }))).toContain(`(${text})`);
    }
  );

  it('marks events and ended states while preserving unverified legacy labels', () => {
    expect(graphEdgeLabel(relationship('r', { temporal_scope: 'event', state: 'ended' }))).toBe(
      '지인 (사건) (종료)'
    );
    expect(graphEdgeLabel(legacy)).toBe('지인');
    expect(graphEdgeLabel(relationship('r'))).toBe('지인');
  });
});
