import { Relationship, RelationshipSemantics } from '../../../src/shared/types';
import { latestRelationshipVersions } from '../../../src/modules/ssabi/relationship-versions';
import { FakeSsabiRepository } from '../../../src/modules/ssabi/__mocks__/fake-repository';

const semantics = (overrides: Partial<RelationshipSemantics> = {}): RelationshipSemantics => ({
  version: 2,
  direction: 'a_to_b',
  kind: 'emotion',
  relation_key: 'trust',
  summary: 'A는 B를 신뢰한다.',
  assertion_status: 'fact',
  temporal_scope: 'ongoing',
  state: 'active',
  evidence: { source_page: 2, quote: 'A는 B를 신뢰했다.', start_char: 0, end_char: 12 },
  ...overrides,
});
const row = (id: string, page: number, s?: RelationshipSemantics): Relationship => ({
  id,
  book_id: 'book',
  character_a_id: 'a',
  character_b_id: 'b',
  label: id,
  established_page: page,
  semantics: s,
});

describe('FR-CHR-001: independent directed relationship histories', () => {
  it('keeps reverse attitudes and simultaneous facets, updates only the same track', () => {
    const selected = latestRelationshipVersions([
      row('trust-old', 2, semantics()),
      row('trust-new', 5, semantics({ state: 'ended' })),
      row('reverse', 3, semantics({ direction: 'b_to_a' })),
      row('jealousy', 3, semantics({ relation_key: 'jealousy' })),
    ]);
    expect(selected.map((r) => r.id).sort()).toEqual(['jealousy', 'reverse', 'trust-new']);
  });

  it('does not collapse separate occurrences into a persistent relationship', () => {
    expect(
      latestRelationshipVersions([
        row('help1', 2, semantics({ kind: 'action', temporal_scope: 'event' })),
        row('help2', 3, semantics({ kind: 'action', temporal_scope: 'event' })),
      ])
    ).toHaveLength(2);
  });

  it('keeps legacy pair-latest compatibility without inventing direction', () => {
    expect(latestRelationshipVersions([row('old', 2), row('new', 5)]).map((r) => r.id)).toEqual([
      'new',
    ]);
  });

  it('FR-SPL-002: history and evidence obey the same cutoff, including endpoints', async () => {
    const repository = new FakeSsabiRepository({
      characters: [
        { id: 'a', book_id: 'book', name: 'A', first_appearance_page: 1 },
        { id: 'b', book_id: 'book', name: 'B', first_appearance_page: 2 },
        { id: 'future', book_id: 'book', name: 'Future', first_appearance_page: 20 },
      ],
      aliases: [],
      characterNotes: [],
      backgroundKnowledge: '',
      relationships: [
        row('old', 2, semantics()),
        row(
          'change',
          5,
          semantics({
            evidence: { source_page: 5, quote: '끝', start_char: 0, end_char: 1 },
            state: 'ended',
          })
        ),
        row(
          'future-proof',
          2,
          semantics({
            relation_key: 'rumor',
            evidence: { source_page: 9, quote: '미래', start_char: 0, end_char: 2 },
          })
        ),
        { ...row('hidden-person', 2), character_b_id: 'future' },
      ],
    });
    expect((await repository.getGraph('book', 1)).edges).toEqual([]);
    const at2 = await repository.getGraph('book', 2);
    expect(at2.edges.map((r) => r.id)).toEqual(['old']);
    expect(at2.history?.map((r) => r.id)).toEqual(['old']);
    const at5 = await repository.getGraph('book', 5);
    expect(at5.edges.map((r) => r.id)).toEqual(['change']);
    expect(at5.history?.map((r) => r.id)).toEqual(['old', 'change']);
    expect(at5.applied_cutoff).toBe(5);
  });
});
