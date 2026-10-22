import { createHash } from 'crypto';
import { Page } from '../../shared/types';
import { validateGroundedChapter, assertGroundingCache, groundingManifest } from './grounding';
import { createEmptyState, mergeRelationships } from './accumulate';

const page = (page_no: number, content: string): Page => ({
  id: `p${page_no}`,
  book_id: 'fixture',
  page_no,
  content,
});
const evidence = (p: Page, quote = p.content) => ({ source_page: p.page_no, quote });
const person = (p: Page, name: string, aliases: unknown[] = []) => ({
  name,
  entity_type: 'person',
  identity_status: 'distinct',
  first_appearance_page: p.page_no,
  rationale: '원문에서 인물을 지칭한다.',
  evidence: evidence(p),
  aliases,
  notes: [],
});
const alias = (p: Page, value: string, type = 'nickname') => ({
  alias: value,
  type,
  reference_type: 'person_label',
  first_appearance_page: p.page_no,
  identity_established_page: p.page_no,
  rationale: '동일인 호칭이다.',
  evidence: evidence(p),
});
const relationship = (p: Page, label: string, quote = p.content) => ({
  character_a: '민수',
  character_b: '영희',
  label,
  established_page: p.page_no,
  assertion_status: 'fact',
  change_type: 'establishment',
  rationale: '관계를 명시한다.',
  evidence: evidence(p, quote),
});

describe('audit regressions: exact source presence is not sufficient', () => {
  test.each([
    ['민수는 키가 대중없이 길다.', '키가 대중없이 길다', 'nickname'],
    [
      '민수는 검인의 스탬프를 손에 쥐고 있는 사내다.',
      '검인의 스탬프를 손에 쥐고 있는 사내',
      'nickname',
    ],
    ['민수네 내외가 들어왔다.', '민수네 내외', 'kinship'],
    ['민수는 처자들의 얼굴을 보았다.', '처자', 'kinship'],
    ['민수는 오꼼이다. 오꼼이가 문을 열었다.', '오꼼이가', 'name'],
    ['민수의 다른 표기는 민순지 민수인지 잘 모르겠다.', '민순', 'name'],
    ['민수는 영희의 친구다.', '영희의 친구', 'kinship'],
    ['민수는 식모로 일한다.', '식모', 'nickname'],
  ])('holds invalid alias %s / %s / %s', (text, value, type) => {
    const p = page(1, text);
    const out = validateGroundedChapter(
      { characters: [person(p, '민수', [alias(p, value, type)])] },
      [p]
    );
    expect(out.characters).toHaveLength(1);
    expect(out.characters[0].aliases).toEqual([]);
    expect(out.review).toEqual([expect.objectContaining({ kind: 'alias' })]);
  });

  test('preserves genuine nicknames, spacing variants and job titles', () => {
    const p = page(1, '민수는 민 수라고도 적는다. 키가 커서 전봇대라 불린다. 민수는 식모다.');
    const out = validateGroundedChapter(
      {
        characters: [
          person(p, '민수', [
            alias(p, '민 수', 'name'),
            alias(p, '전봇대'),
            alias(p, '식모', 'title'),
          ]),
        ],
      },
      [p]
    );
    expect(out.characters[0].aliases.map((a) => a.alias)).toEqual(['민 수', '전봇대', '식모']);
  });

  test.each([undefined, 'description', 'collective', 'utterance', 'non_person', 'uncertain'])(
    'alias reference classification %s is held even with a nominal spelling',
    (reference_type) => {
      const p = page(1, '민수는 전봇대라는 말을 썼다.');
      const candidate = { ...alias(p, '전봇대'), reference_type };
      const out = validateGroundedChapter({ characters: [person(p, '민수', [candidate])] }, [p]);
      expect(out.characters[0].aliases).toEqual([]);
      expect(out.review[0].kind).toBe('alias');
    }
  );

  test.each(['로', '에게', '부터', '만'])(
    'a valid title before particle %s is an independent mention',
    (particle) => {
      const p = page(1, `민수는 식모${particle} 일을 이야기했다.`);
      expect(
        validateGroundedChapter({ characters: [person(p, '민수', [alias(p, '식모', 'title')])] }, [
          p,
        ]).characters[0].aliases
      ).toHaveLength(1);
    }
  );

  test.each([
    ['민수는 며칠 뒤면 영희와 결혼을 할 것이다.', '부부'],
    ['민수는 영희를 딸로 데려오려 했으나 아직 데려오지 못했다.', '양부와 양딸'],
    ['민수는 영희를 친누이동생인 양 생각했다.', '남매'],
  ])('does not promote an unrealized or figurative relation to fact: %s', (text, label) => {
    const p = page(1, text);
    const out = validateGroundedChapter({ relationships: [relationship(p, label)] }, [p]);
    expect(out.relationships).toEqual([]);
    expect(out.review).toEqual([expect.objectContaining({ kind: 'relationship' })]);
  });

  test('checks a neighboring page that explicitly refutes the quoted statement', () => {
    const first = page(1, '민수는 영희의 유언을 전한다고 말했다.');
    const second = page(2, '지금 하는 소리는 생판 거짓말이었다.');
    const out = validateGroundedChapter({ relationships: [relationship(first, '유언 이행자')] }, [
      first,
      second,
    ]);
    expect(out.relationships).toEqual([]);
    expect(out.review[0].kind).toBe('relationship');
  });

  test('a declared belief is held even when the quote has both names', () => {
    const p = page(1, '민수는 영희가 자신을 사랑한다고 믿었다.');
    const out = validateGroundedChapter(
      { relationships: [{ ...relationship(p, '연인'), assertion_status: 'belief' }] },
      [p]
    );
    expect(out.relationships).toEqual([]);
  });

  test('realized relation and a separate future action remain acceptable', () => {
    const p = page(1, '민수와 영희의 결혼식은 끝났다. 두 사람은 다음 주에 여행을 갈 것이다.');
    expect(
      validateGroundedChapter({ relationships: [relationship(p, '부부')] }, [p]).relationships
    ).toHaveLength(1);
  });

  test('an unrelated later lie does not disqualify a direct factual sentence', () => {
    const p = page(1, '민수와 영희는 부부다. 철수는 돈을 빌린 적이 없다고 거짓말을 했다.');
    expect(
      validateGroundedChapter(
        { relationships: [relationship(p, '부부', '민수와 영희는 부부다.')] },
        [p]
      ).relationships
    ).toHaveLength(1);
  });

  test('an exclusion for an object does not hide another person mention on that page', () => {
    const first = page(1, '전봇대가 길가에 서 있다. 전봇대라 불리는 사내가 인사했다.');
    const later = page(2, '전봇대는 하바꾼이다.');
    const candidate = {
      ...person(later, '전봇대'),
      earlier_mentions: [
        {
          source_page: 1,
          kind: 'non_person',
          rationale: '첫 문장은 사물이다.',
          evidence: evidence(first, '전봇대가 길가에 서 있다.'),
        },
      ],
    };
    expect(validateGroundedChapter({ characters: [candidate] }, [first, later]).characters).toEqual(
      []
    );
  });

  test('a newly disclosed relation is distinct from a changed state and can become visible', () => {
    const p = page(3, '민수와 영희가 실은 사촌이었다는 사실이 밝혀졌다.');
    const candidate = {
      ...relationship(p, '사촌'),
      change_type: 'disclosure',
      change_evidence: evidence(p),
    };
    const accepted = validateGroundedChapter({ relationships: [candidate] }, [p]).relationships;
    expect(accepted).toHaveLength(1);
    const state = createEmptyState();
    mergeRelationships(state, [
      { character_a_id: 'a', character_b_id: 'b', label: '친구', established_page: 1 },
    ]);
    mergeRelationships(
      state,
      accepted.map((r) => ({ ...r, character_a_id: 'a', character_b_id: 'b' }))
    );
    expect(state.relationships.map((r) => [r.label, r.established_page])).toEqual([
      ['친구', 1],
      ['사촌', 3],
    ]);
  });

  test('holds a late first appearance without guessing identity from earlier spelling', () => {
    const first = page(1, '행화가 웃으며 가게로 들어왔다.');
    const later = page(2, '행화는 기생이다.');
    const out = validateGroundedChapter({ characters: [person(later, '행화')] }, [first, later]);
    expect(out.characters).toEqual([]);
    expect(out.review).toEqual([
      expect.objectContaining({ kind: 'character', reason: expect.stringMatching(/earlier/i) }),
    ]);
  });

  test('an earlier substring inside another name is not an earlier mention', () => {
    const first = page(1, '김민수는 걷는다.');
    const later = page(2, '민수는 다른 사람이다.');
    expect(
      validateGroundedChapter({ characters: [person(later, '민수')] }, [first, later]).characters
    ).toHaveLength(1);
  });
});

describe('audit regressions: relationships preserve the original fact boundary', () => {
  test('equivalent static family labels retain the earliest row across chapters', () => {
    const state = createEmptyState();
    mergeRelationships(state, [
      { character_a_id: 'a', character_b_id: 'b', label: '부녀', established_page: 6 },
    ]);
    mergeRelationships(state, [
      { character_a_id: 'b', character_b_id: 'a', label: '딸/아버지', established_page: 40 },
    ]);
    expect(state.relationships.map((r) => [r.label, r.established_page])).toEqual([['부녀', 6]]);
  });

  test('a later restatement does not restore a superseded relationship', () => {
    const state = createEmptyState();
    mergeRelationships(state, [
      { character_a_id: 'a', character_b_id: 'b', label: '부부', established_page: 169 },
      {
        character_a_id: 'a',
        character_b_id: 'b',
        label: '사별',
        established_page: 206,
        change_type: 'transition',
        change_evidence: {
          source_page: 206,
          quote: '배우자가 죽었다.',
          start_char: 0,
          end_char: 9,
        },
      },
    ]);
    mergeRelationships(state, [
      { character_a_id: 'a', character_b_id: 'b', label: '부부', established_page: 209 },
    ]);
    expect(state.relationships.map((r) => r.label)).toEqual(['부부', '사별']);
    expect(state.review).toEqual([expect.objectContaining({ kind: 'relationship' })]);
  });

  test('different wording alone cannot become a new latest state', () => {
    const state = createEmptyState();
    mergeRelationships(state, [
      { character_a_id: 'a', character_b_id: 'b', label: '동네 친구', established_page: 3 },
    ]);
    mergeRelationships(state, [
      {
        character_a_id: 'a',
        character_b_id: 'b',
        label: '오래된 벗',
        established_page: 20,
        change_type: 'establishment',
      },
    ]);
    expect(state.relationships.map((r) => r.established_page)).toEqual([3]);
    expect(state.review[0].kind).toBe('relationship');
  });
});

test('matching source manifest cannot authorize edited cached output', () => {
  const p = page(1, '민수는 걷는다.');
  const chapter = {
    id: 'c1',
    book_id: 'fixture',
    chapter_no: 1,
    title: 'fixture',
    start_page: 1,
    end_page: 1,
  };
  const body = { characters: [person(p, '민수')], relationships: [], review: [] };
  const cache = {
    ...body,
    grounding: {
      ...groundingManifest(chapter, [p]),
      content_hash: createHash('sha256').update(JSON.stringify(body)).digest('hex'),
    },
  };
  expect(() => assertGroundingCache(cache, chapter, [p])).not.toThrow();
  cache.characters[0].name = '조작한 이름';
  expect(() => assertGroundingCache(cache, chapter, [p])).toThrow(/Stale|changed/i);
});
