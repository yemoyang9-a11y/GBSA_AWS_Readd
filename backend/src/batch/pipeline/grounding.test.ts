import * as generation from './generate';
import { Page } from '../../shared/types';
import { createEmptyState, mergeCharacters, resolveCharacterId } from './accumulate';
import { assertGroundingCache, sealChapterCache } from './grounding';
import { checkIntegrity } from './check-integrity';

// Deliberately exercise the public boundary used by both new output and cache replay.
const validate = (input: unknown, pages: Page[]) => {
  const fn = (
    generation as unknown as {
      validateGroundedChapter: (input: unknown, pages: Page[]) => any;
    }
  ).validateGroundedChapter;
  expect(typeof fn).toBe('function');
  return fn(input, pages);
};

const pages: Page[] = [
  {
    id: 'p1',
    book_id: 'fixture',
    page_no: 1,
    content: '창가에 전봇대가 서 있다. 영수는 길을 걷는다.',
  },
  {
    id: 'p2',
    book_id: 'fixture',
    page_no: 2,
    content: '민수는 키가 커서 전봇대라 불리는 사람이다. 전봇대는 영희의 친구다.',
  },
];
const evidence = (page: Page, quote = page.content) => ({
  source_page: page.page_no,
  quote,
  start_char: page.content.indexOf(quote),
  end_char: page.content.indexOf(quote) + quote.length,
});
const person = (name = '민수') => ({
  name,
  first_appearance_page: 2,
  entity_type: 'person',
  identity_status: 'same',
  rationale: '사람이라고 명시하며 키와 별명으로 설명한다.',
  evidence: evidence(pages[1]),
  earlier_mentions:
    name === '전봇대'
      ? [
          {
            source_page: 1,
            kind: 'non_person',
            rationale: '첫 페이지의 전봇대는 사물이다.',
            evidence: evidence(pages[0], '창가에 전봇대가 서 있다.'),
          },
        ]
      : [],
  aliases: [],
  notes: [],
});

describe('grounded extraction boundary', () => {
  test('keeps person nicknames without treating object spelling as a blacklist', () => {
    const out = validate({ characters: [person('전봇대')], relationships: [] }, pages);
    expect(out.characters.map((c: any) => c.name)).toEqual(['전봇대']);
    expect(out.review).toHaveLength(0);
  });

  test('quote presence alone does not establish personhood', () => {
    const candidate = {
      ...person('전봇대'),
      first_appearance_page: 1,
      entity_type: 'uncertain',
      rationale: '사물인지 별명인지 불명확하다.',
      evidence: evidence(pages[0]),
    };
    const out = validate({ characters: [candidate] }, pages);
    expect(out.characters).toHaveLength(0);
    expect(out.review[0].candidate).toEqual(candidate);
  });

  test('derives offsets from a unique exact quote and keeps a nonhuman fictional agent', () => {
    const page = { ...pages[1], content: '바둑이는 말하는 개로서 친구에게 대답했다.' };
    const out = validate(
      {
        characters: [
          {
            ...person('바둑이'),
            rationale: '말을 하고 응답하는 비인간 서사 행위자다.',
            evidence: { source_page: 2, quote: page.content },
          },
        ],
      },
      [page]
    );
    expect(out.characters).toHaveLength(1);
    expect(out.characters[0].evidence).toMatchObject({
      start_char: 0,
      end_char: page.content.length,
    });
  });

  test('a repeated quote without offsets remains held rather than guessing its position', () => {
    const page = { ...pages[1], content: '민수는 걷는다. 민수는 걷는다.' };
    expect(
      validate(
        { characters: [{ ...person(), evidence: { source_page: 2, quote: '민수는 걷는다.' } }] },
        [page]
      ).characters
    ).toHaveLength(0);
  });

  test.each([
    { evidence: { ...evidence(pages[1]), quote: '민수는 의사다.' } },
    { evidence: { ...evidence(pages[1]), source_page: 1 } },
    { evidence: { ...evidence(pages[1]), start_char: 1 } },
    { first_appearance_page: 1 },
    { rationale: '' },
  ])('quarantines forged, misplaced, premature or unexplained evidence: %p', (change) => {
    const out = validate({ characters: [{ ...person(), ...change }] }, pages);
    expect(out.characters).toHaveLength(0);
    expect(out.review).toHaveLength(1);
  });

  test('holds unsupported notes and alias identity while preserving the valid person', () => {
    const c = {
      ...person(),
      aliases: [{ alias: '의사', type: 'title', first_appearance_page: 2 }],
      notes: [
        { note: '의사다.', source_page: 2, evidence: { ...evidence(pages[1]), quote: '의사다.' } },
      ],
    };
    const out = validate({ characters: [c] }, pages);
    expect(out.characters).toHaveLength(1);
    expect(out.characters[0].aliases).toHaveLength(0);
    expect(out.characters[0].notes).toHaveLength(0);
    expect(out.review).toHaveLength(2);
  });

  test('validates explicit alias identity independently of its mention date', () => {
    const alias = {
      alias: '전봇대',
      type: 'nickname',
      reference_type: 'person_label',
      first_appearance_page: 1,
      identity_established_page: 2,
      rationale: '민수를 전봇대라 부른다고 명시한다.',
      evidence: evidence(pages[1]),
    };
    const out = validate({ characters: [{ ...person(), aliases: [alias] }] }, pages);
    expect(out.characters[0].aliases[0].first_appearance_page).toBe(2);
    expect(out.characters[0].aliases[0].mention_page).toBe(1);
  });

  test('does not accept an unrelated same-page quote as evidence for a name', () => {
    const out = validate(
      {
        characters: [
          {
            ...person('영희'),
            evidence: evidence(pages[1], '민수는 키가 커서 전봇대라 불리는 사람이다.'),
          },
        ],
      },
      pages
    );
    expect(out.characters).toHaveLength(0);
  });

  test('valid relationship evidence names both endpoints; legacy cache entries are held', () => {
    const relationship = {
      character_a: '전봇대',
      character_b: '영희',
      label: '친구',
      established_page: 2,
      assertion_status: 'fact',
      change_type: 'establishment',
      evidence: evidence(pages[1]),
      rationale: '친구라고 명시한다.',
    };
    const out = validate(
      { characters: [], relationships: [relationship, { ...relationship, evidence: undefined }] },
      pages
    );
    expect(out.relationships).toEqual([relationship]);
    expect(out.review).toHaveLength(1);
  });
});

describe('identity safety and reproducible replay', () => {
  test('shared kinship/title never resolve to the first person', () => {
    const state = createEmptyState();
    mergeCharacters(
      state,
      ['민수', '영수'].map((name) => ({
        name,
        first_appearance_page: 1,
        aliases: [{ alias: '아버지', type: 'kinship', first_appearance_page: 1 }],
        notes: [],
      }))
    );
    expect(resolveCharacterId(state, '아버지')).toBeUndefined();
    mergeCharacters(state, [{ name: '아버지', first_appearance_page: 3, aliases: [], notes: [] }]);
    expect(state.characters.map((c) => c.name)).toEqual(['민수', '영수', '아버지']);
  });

  test('reverse alias matching retains the earlier display name and dates the new name', () => {
    const state = createEmptyState();
    mergeCharacters(state, [{ name: '전봇대', first_appearance_page: 1, aliases: [], notes: [] }]);
    const out = validate(
      {
        characters: [
          {
            ...person(),
            aliases: [
              {
                alias: '전봇대',
                type: 'nickname',
                reference_type: 'person_label',
                first_appearance_page: 1,
                identity_established_page: 2,
                evidence: evidence(pages[1]),
                rationale: '별명이 명시된다.',
              },
            ],
          },
        ],
      },
      pages
    );
    mergeCharacters(state, out.characters);
    expect(state.characters).toHaveLength(1);
    expect(state.characters[0].name).toBe('전봇대');
    expect(state.characters[0].first_appearance_page).toBe(1);
    expect(state.characters[0].aliases.find((a) => a.alias === '민수')?.first_appearance_page).toBe(
      2
    );
    expect((resolveCharacterId as any)(state, '민수', 1)).toBeUndefined();
    expect((resolveCharacterId as any)(state, '민수', 2)).toBe(state.characters[0].id);
  });

  test('replaying an identical chapter preserves IDs and does not duplicate notes', () => {
    const input = [
      {
        name: '민수',
        first_appearance_page: 2,
        aliases: [],
        notes: [{ note: '키가 크다.', source_page: 2 }],
      },
    ];
    const a = createEmptyState();
    const b = createEmptyState();
    mergeCharacters(a, input);
    mergeCharacters(b, input);
    expect(a).toEqual(b);
    const snapshot = JSON.stringify(a);
    mergeCharacters(a, input);
    expect(JSON.stringify(a)).toBe(snapshot);
  });

  test('explicitly distinct people sharing a name stay separate and unresolved', () => {
    const state = createEmptyState();
    mergeCharacters(state, [{ name: '민수', first_appearance_page: 1, aliases: [], notes: [] }]);
    const candidate = { ...person(), identity_status: 'distinct' };
    mergeCharacters(state, validate({ characters: [candidate] }, pages).characters);
    expect(state.characters).toHaveLength(2);
    expect(resolveCharacterId(state, '민수')).toBeUndefined();
  });

  test('distinct people with the same name on one page use separate source anchors', () => {
    const page = { ...pages[1], content: '형 민수는 일한다. 동생 민수는 공부한다.' };
    const candidates = ['형 민수는 일한다.', '동생 민수는 공부한다.'].map((quote) => ({
      ...person(),
      identity_status: 'distinct',
      evidence: evidence(page, quote),
    }));
    const state = createEmptyState();
    const validated = validate({ characters: candidates }, [page]).characters;
    mergeCharacters(state, validated);
    expect(state.characters).toHaveLength(2);
    expect(new Set(state.characters.map((c) => c.id)).size).toBe(2);
    const before = JSON.stringify(state);
    mergeCharacters(state, validated);
    expect(JSON.stringify(state)).toBe(before);
    expect(resolveCharacterId(state, '민수')).toBeUndefined();
    const report = checkIntegrity(
      {
        book_id: 'fixture',
        characters: state.characters,
        relationships: [],
        terms: [],
        events: [],
        chapter_summaries: [],
        background_and_intro: { background: '', intro: '' },
      },
      2
    );
    expect(report.ok).toBe(true);
    expect(report.issues.some((issue) => issue.severity === 'review')).toBe(true);
  });

  test('multiple reverse candidates are held without modifying either existing identity', () => {
    const state = createEmptyState();
    mergeCharacters(
      state,
      ['민수', '영희'].map((name) => ({ name, first_appearance_page: 1, aliases: [], notes: [] }))
    );
    const before = JSON.stringify(state.characters);
    const c = {
      ...person('전봇대'),
      aliases: ['민수', '영희'].map((alias) => ({
        alias,
        type: 'nickname',
        reference_type: 'person_label',
        first_appearance_page: 2,
        identity_established_page: 2,
        evidence: evidence(pages[1]),
        rationale: '동일인 후보',
      })),
    };
    mergeCharacters(state, validate({ characters: [c] }, pages).characters);
    expect(JSON.stringify(state.characters)).toBe(before);
    expect(state.review).toHaveLength(1);
  });

  test('chronological identity resolution is independent of model array order', () => {
    const page = { ...pages[0], content: '전봇대라는 별명의 사람이 길을 걷는다.' };
    const first = {
      ...person('전봇대'),
      first_appearance_page: 1,
      evidence: evidence(page),
      identity_status: 'distinct',
    };
    const later = {
      ...person(),
      aliases: [
        {
          alias: '전봇대',
          type: 'nickname',
          reference_type: 'person_label',
          first_appearance_page: 1,
          identity_established_page: 2,
          evidence: evidence(pages[1]),
          rationale: '별명이 명시된다.',
        },
      ],
    };
    const validated = validate({ characters: [first, later] }, [page, pages[1]]).characters;
    const a = createEmptyState();
    const b = createEmptyState();
    mergeCharacters(a, validated);
    mergeCharacters(b, [...validated].reverse());
    expect(a).toEqual(b);
    expect(a.characters).toHaveLength(1);
  });

  test('conflicting distinct identities with one shared source anchor remain in review', () => {
    const c = { ...person(), identity_status: 'distinct' };
    const state = createEmptyState();
    mergeCharacters(
      state,
      validate({ characters: [c, { ...c, rationale: '동명이인 동생이다.' }] }, pages).characters
    );
    expect(state.review).toHaveLength(1);
    expect(state.characters).toHaveLength(1);
    expect(state.review[0].candidate).toEqual(
      expect.objectContaining({ rationale: '동명이인 동생이다.' })
    );
    expect(resolveCharacterId(state, '민수', 2)).toBeUndefined();
    const laterPage = { ...pages[1], page_no: 3, content: '민수는 의사다.' };
    const laterEvidence = evidence(laterPage);
    const later = {
      ...person(),
      first_appearance_page: 3,
      evidence: laterEvidence,
      notes: [
        { note: '의사다.', source_page: 3, rationale: '직업을 명시한다.', evidence: laterEvidence },
      ],
    };
    mergeCharacters(state, validate({ characters: [later] }, [laterPage]).characters);
    expect(state.characters[0].notes).toHaveLength(0);
    expect(state.review.some((r) => (r.candidate as any).first_appearance_page === 3)).toBe(true);
  });
});

describe('cache provenance', () => {
  const chapter = {
    id: 'c',
    book_id: 'fixture',
    chapter_no: 1,
    title: 'fixture',
    start_page: 1,
    end_page: 2,
  };
  test('rejects legacy and changed-source caches before replay', () => {
    expect(() => assertGroundingCache({}, chapter, pages)).toThrow(/Stale/);
    const cache = sealChapterCache({}, chapter, pages);
    expect(() => assertGroundingCache(cache, chapter, pages)).not.toThrow();
    expect(() =>
      assertGroundingCache(cache, chapter, [{ ...pages[0], content: 'changed' }, pages[1]])
    ).toThrow(/Stale/);
    expect(() => assertGroundingCache(cache, { ...chapter, title: 'changed' }, pages)).toThrow(
      /Stale/
    );
  });

  test('changed known-character context or extraction contract invalidates a cache', () => {
    const cache = sealChapterCache({}, chapter, pages);
    expect(() => (assertGroundingCache as any)(cache, chapter, pages, ['new known name'])).toThrow(
      /Stale/
    );
    expect(() =>
      (assertGroundingCache as any)(cache, chapter, pages, [], 'changed prompt contract')
    ).toThrow(/Stale/);
  });
});
