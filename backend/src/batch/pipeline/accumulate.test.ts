import {
  createEmptyState,
  mergeCharacters,
  mergeRelationships,
  mergeTerms,
  resolveCharacterId,
  knownCharacterNames,
} from './accumulate';
import { validateGroundedChapter } from './grounding';

describe('FR-SPL-002: identity facts respect their established page', () => {
  const pages = [
    { id: 'p1', book_id: 'fixture', page_no: 1, content: '가면남은 문을 열었다.' },
    { id: 'p2', book_id: 'fixture', page_no: 2, content: '민수는 의사다.' },
    { id: 'p3', book_id: 'fixture', page_no: 3, content: '가면남의 정체는 의사 민수였다.' },
  ];
  const evidence = (page: (typeof pages)[number]) => ({
    source_page: page.page_no,
    quote: page.content,
  });
  const candidates = (firstAppearance: 2 | 3) => [
    {
      name: '가면남',
      first_appearance_page: 1,
      entity_type: 'person',
      identity_status: 'distinct',
      rationale: '행동하는 인물이다.',
      evidence: evidence(pages[0]),
      aliases: [],
      notes: [],
    },
    {
      name: '민수',
      first_appearance_page: firstAppearance,
      entity_type: 'person',
      identity_status: 'same',
      rationale: '3페이지에서 가면남과 동일인이라고 밝힌다.',
      evidence: evidence(pages[firstAppearance - 1]),
      aliases: [
        {
          alias: '가면남',
          type: 'nickname',
          first_appearance_page: 1,
          identity_established_page: 3,
          rationale: '3페이지에서 정체를 명시한다.',
          evidence: evidence(pages[2]),
        },
      ],
      notes: [
        {
          note: '의사다.',
          source_page: firstAppearance,
          rationale: '직업을 명시한다.',
          evidence: evidence(pages[firstAppearance - 1]),
        },
      ],
    },
  ];

  test('keeps separately introduced names and their notes before a later identity link', () => {
    const output = validateGroundedChapter({ characters: candidates(2) }, pages);
    expect(output.review).toEqual([]);
    const state = createEmptyState('fixture');
    mergeCharacters(state, output.characters);

    expect(state.characters).toHaveLength(2);
    const masked = state.characters.find((c) => c.name === '가면남')!;
    const minsu = state.characters.find((c) => c.name === '민수')!;
    expect(masked.notes).toEqual([]);
    expect(minsu.notes).toEqual([expect.objectContaining({ note: '의사다.', source_page: 2 })]);
    expect(resolveCharacterId(state, '가면남', 2)).toBe(masked.id);
    expect(resolveCharacterId(state, '민수', 2)).toBe(minsu.id);
    expect(minsu.aliases).toEqual([]);
    expect(state.review).toEqual([expect.objectContaining({ kind: 'alias' })]);

    const snapshot = JSON.stringify(state);
    mergeCharacters(state, output.characters);
    expect(JSON.stringify(state)).toBe(snapshot);
  });

  test('merges a name first introduced on the identity establishment page', () => {
    const output = validateGroundedChapter({ characters: candidates(3) }, pages);
    const state = createEmptyState('fixture');
    mergeCharacters(state, output.characters);

    expect(state.characters).toHaveLength(1);
    expect(state.characters[0].notes[0].source_page).toBe(3);
    expect(resolveCharacterId(state, '민수', 2)).toBeUndefined();
    expect(resolveCharacterId(state, '민수', 3)).toBe(state.characters[0].id);
    expect(state.review).toEqual([]);
  });
});

describe('mergeCharacters — 챕터 간 인물 상태 누적', () => {
  test('새 인물은 새 id로 추가된다', () => {
    const state = createEmptyState();
    mergeCharacters(state, [{ name: '정주사', first_appearance_page: 3, aliases: [], notes: [] }]);

    expect(state.characters).toHaveLength(1);
    expect(state.characters[0].name).toBe('정주사');
  });

  test('이미 등장한 인물은 같은 id를 재사용하고 새 인물로 중복 생성하지 않는다', () => {
    const state = createEmptyState();
    mergeCharacters(state, [{ name: '정주사', first_appearance_page: 3, aliases: [], notes: [] }]);
    const firstId = state.characters[0].id;

    mergeCharacters(state, [{ name: '정주사', first_appearance_page: 20, aliases: [], notes: [] }]);

    expect(state.characters).toHaveLength(1);
    expect(state.characters[0].id).toBe(firstId);
  });

  test('새 별칭은 누적되고, 이미 등록된 별칭은 최초 등장 페이지를 덮어쓰지 않는다', () => {
    const state = createEmptyState();
    mergeCharacters(state, [
      {
        name: '정주사',
        first_appearance_page: 3,
        aliases: [{ alias: '정 주사', type: 'name', first_appearance_page: 3 }],
        notes: [],
      },
    ]);

    mergeCharacters(state, [
      {
        name: '정주사',
        first_appearance_page: 3,
        aliases: [
          { alias: '정 주사', type: 'name', first_appearance_page: 55 }, // 재등장 — 덮어쓰면 안 됨
          { alias: '장인', type: 'kinship', first_appearance_page: 55 }, // 새 별칭
        ],
        notes: [],
      },
    ]);

    const aliases = state.characters[0].aliases;
    expect(aliases).toHaveLength(2);
    expect(aliases.find((a) => a.alias === '정 주사')?.first_appearance_page).toBe(3);
    expect(aliases.find((a) => a.alias === '장인')?.first_appearance_page).toBe(55);
  });

  test('노트는 장마다 그대로 누적된다(장당 상한은 프롬프트 책임)', () => {
    const state = createEmptyState();
    mergeCharacters(state, [
      {
        name: '정주사',
        first_appearance_page: 3,
        aliases: [],
        notes: [{ note: '몰락한 양반', source_page: 3 }],
      },
    ]);
    mergeCharacters(state, [
      {
        name: '정주사',
        first_appearance_page: 3,
        aliases: [],
        notes: [{ note: '미두에 손을 댐', source_page: 40 }],
      },
    ]);

    expect(state.characters[0].notes).toHaveLength(2);
  });
});

describe('resolveCharacterId / knownCharacterNames', () => {
  test('대표명과 별칭 둘 다로 id를 찾을 수 있다', () => {
    const state = createEmptyState();
    mergeCharacters(state, [
      {
        name: '정주사',
        first_appearance_page: 3,
        aliases: [{ alias: '정 주사', type: 'name', first_appearance_page: 3 }],
        notes: [],
      },
    ]);

    const id = state.characters[0].id;
    expect(resolveCharacterId(state, '정주사')).toBe(id);
    expect(resolveCharacterId(state, '정 주사')).toBe(id);
  });

  test('등록되지 않은 이름은 undefined를 반환한다(지어내지 않는다)', () => {
    const state = createEmptyState();
    expect(resolveCharacterId(state, '없는인물')).toBeUndefined();
  });

  test('다음 장 힌트는 대표명 목록이다', () => {
    const state = createEmptyState();
    mergeCharacters(state, [{ name: '정주사', first_appearance_page: 3, aliases: [], notes: [] }]);
    mergeCharacters(state, [{ name: '초봉이', first_appearance_page: 5, aliases: [], notes: [] }]);

    expect(knownCharacterNames(state)).toEqual(['정주사', '초봉이']);
  });
});

describe('mergeRelationships — 이력형 관계 (A6, FR-CHR-001 🚦)', () => {
  test('unordered model output retains the earliest same-label relationship', () => {
    const state = createEmptyState();
    mergeRelationships(
      state,
      [30, 10].map((established_page) => ({
        character_a_id: 'a',
        character_b_id: 'b',
        label: '친구',
        established_page,
      }))
    );
    expect(state.relationships.map((r) => r.established_page)).toEqual([10]);
  });
  test('처음 등장하는 쌍은 새 행으로 추가된다', () => {
    const state = createEmptyState();
    mergeRelationships(state, [
      { character_a_id: 'a', character_b_id: 'b', label: '약혼', established_page: 30 },
    ]);

    expect(state.relationships).toHaveLength(1);
  });

  test('같은 쌍, 같은 라벨의 재서술은 중복 행을 만들지 않는다', () => {
    const state = createEmptyState();
    mergeRelationships(state, [
      { character_a_id: 'a', character_b_id: 'b', label: '약혼', established_page: 30 },
    ]);
    mergeRelationships(state, [
      { character_a_id: 'a', character_b_id: 'b', label: '약혼', established_page: 90 },
    ]);

    expect(state.relationships).toHaveLength(1);
  });

  test('같은 쌍, 라벨이 바뀌면 기존 행을 덮어쓰지 않고 새 행을 추가한다(이력형)', () => {
    const state = createEmptyState();
    mergeRelationships(state, [
      { character_a_id: 'a', character_b_id: 'b', label: '약혼', established_page: 30 },
    ]);
    mergeRelationships(state, [
      { character_a_id: 'a', character_b_id: 'b', label: '부부', established_page: 90 },
    ]);

    expect(state.relationships).toHaveLength(2);
    expect(state.relationships[0].label).toBe('약혼');
    expect(state.relationships[0].established_page).toBe(30); // 기존 행 불변
    expect(state.relationships[1].label).toBe('부부');
  });

  test('인물 쌍 순서가 뒤바뀌어 보고돼도 같은 쌍으로 인식한다', () => {
    const state = createEmptyState();
    mergeRelationships(state, [
      { character_a_id: 'a', character_b_id: 'b', label: '약혼', established_page: 30 },
    ]);
    mergeRelationships(state, [
      { character_a_id: 'b', character_b_id: 'a', label: '부부', established_page: 90 },
    ]);

    expect(state.relationships).toHaveLength(2); // 라벨이 바뀌었으니 새 행 — 순서 뒤바뀜과 무관하게 같은 쌍으로 식별
  });

  test('FR-CHR-001: 순서가 뒤바뀌어 보고돼도 저장되는 character_a_id/character_b_id 순서는 항상 같다', () => {
    // DISTINCT ON (character_a_id, character_b_id)로 최신 라벨만 남기는 조회 쿼리는
    // 같은 쌍의 모든 행이 동일한 컬럼 순서로 저장돼 있다고 가정한다. pairKey()는 순서를
    // 정규화해 "같은 쌍"으로 인식하지만, 저장되는 값도 그 정규화된 순서를 따라야 한다.
    const state = createEmptyState();
    mergeRelationships(state, [
      { character_a_id: 'b', character_b_id: 'a', label: '약혼', established_page: 30 },
    ]);
    mergeRelationships(state, [
      { character_a_id: 'a', character_b_id: 'b', label: '부부', established_page: 90 },
    ]);

    expect(state.relationships).toHaveLength(2);
    const orders = new Set(
      state.relationships.map((r) => `${r.character_a_id}|${r.character_b_id}`)
    );
    expect(orders.size).toBe(1); // 0건이 아니라 "항상 1개 순서"가 기준
  });
});

describe('mergeTerms — 최초 등장 유일성 (DDL UNIQUE(book_id, term))', () => {
  test('새 용어는 추가된다', () => {
    const state = createEmptyState();
    mergeTerms(state, [{ term: '미두장', definition: '...', first_appearance_page: 3 }]);

    expect(state.terms).toHaveLength(1);
  });

  test('이미 등장한 용어는 최초 등장 페이지를 덮어쓰지 않는다', () => {
    const state = createEmptyState();
    mergeTerms(state, [{ term: '미두장', definition: '...', first_appearance_page: 3 }]);
    mergeTerms(state, [
      { term: '미두장', definition: '...(다른 설명)', first_appearance_page: 80 },
    ]);

    expect(state.terms).toHaveLength(1);
    expect(state.terms[0].first_appearance_page).toBe(3);
  });
});
