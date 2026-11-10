import type { GraphEdge, RelationshipSemantics } from '../../types';

/** Synthetic source material for relationship UI tests; not a claim about any book. */
export function relationshipFixture(
  id: string,
  page = 5,
  semantics: Partial<RelationshipSemantics> = {}
): GraphEdge {
  return {
    id,
    source: 'a',
    target: 'b',
    label: '질투',
    established_page: page,
    semantics: {
      version: 2,
      direction: 'b_to_a',
      kind: 'emotion',
      relation_key: id,
      summary: '나는 가를 질투한다.',
      assertion_status: 'fact',
      temporal_scope: 'ongoing',
      state: 'active',
      evidence: { source_page: page, quote: '나는 가를 질투한다.', start_char: 0, end_char: 11 },
      ...semantics,
    },
  };
}
