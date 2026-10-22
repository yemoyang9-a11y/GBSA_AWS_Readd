import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { splitBook } from './split';
import { validateGroundedChapter } from './grounding';
import { createEmptyState, mergeCharacters } from './accumulate';

// Gold extractor outputs below are hand-authored; no live model quality is measured.
const raw = fs.readFileSync(path.join(__dirname, '../../../data/raw/takryu.txt'), 'utf8');
const { pages, chapters } = splitBook(raw, 'takryu');
function evidence(pageNo: number, quote: string) {
  const page = pages.find((p) => p.page_no === pageNo)!;
  const start = page.content.indexOf(quote);
  expect(start).toBeGreaterThanOrEqual(0);
  return { source_page: pageNo, quote, start_char: start, end_char: start + quote.length };
}

test('source fixture is pinned to the actual stored Takryu text and split positions', () => {
  expect(createHash('sha256').update(raw).digest('hex')).toBe(
    '3248eb87f94f993db4d3262f1fc5894628137ccdbde9022b234e9d6ed7c4d186'
  );
  expect(chapters[0]).toMatchObject({ chapter_no: 1, start_page: 1, end_page: 17 });
  const face = evidence(303, '고개 를 한참 쳐들어야 얼굴이 보이는 ‘전봇대’다.');
  const nickname = evidence(304, '키가 대중없이 길대서 ‘전봇대’라는 별명이 생긴 같 은 하바꾼이다.');
  expect(face.start_char).toBeLessThan(face.end_char);
  expect(nickname.start_char).toBe(0);
  const out = validateGroundedChapter(
    {
      characters: [
        {
          name: '전봇대',
          entity_type: 'person',
          identity_status: 'distinct',
          rationale: '얼굴이 보인다는 사람 서술이고 다음 페이지에 별명이 명시된다.',
          first_appearance_page: 303,
          evidence: face,
          aliases: [],
          notes: [],
        },
      ],
    },
    pages.filter((p) => p.page_no >= 303 && p.page_no <= 304)
  );
  expect(out.characters.map((c) => c.name)).toEqual(['전봇대']);
  expect(out.review).toHaveLength(0);
});

test('actual Han/chin-beard labels merge only with their own exact identity evidence', () => {
  const quote =
    '탑삭부리 한참봉은 마침 쌀을 사러 온 아이한테 봉지쌀 한 납대기를 되어 주느라고 꾸부리고 있 다가 힐끔 돌아다보고 인사를 한다는 것이';
  const proof = evidence(13, quote);
  const base = {
    entity_type: 'person',
    identity_status: 'same',
    rationale: '쌀을 되어 주고 돌아다보며 인사하는 사람이다.',
    first_appearance_page: 13,
    evidence: proof,
    aliases: [],
    notes: [],
  };
  const out = validateGroundedChapter(
    {
      characters: [
        { ...base, name: '탑삭부리 한참봉' },
        {
          ...base,
          name: '한참봉',
          aliases: [
            {
              alias: '탑삭부리 한참봉',
              type: 'name',
              first_appearance_page: 13,
              identity_established_page: 13,
              rationale: '한 사람을 탑삭부리 한참봉이라고 지칭한다.',
              evidence: proof,
            },
          ],
        },
        { ...base, name: '한참봉', first_appearance_page: 12 },
        { ...base, name: '쌀', entity_type: 'non_person', rationale: '사람이 되어 주는 곡물이다.' },
      ],
    },
    pages.filter((p) => p.page_no <= 17)
  );
  expect(out.characters).toHaveLength(2);
  expect(out.review).toHaveLength(2);
  const state = createEmptyState('takryu');
  mergeCharacters(state, out.characters);
  expect(state.characters).toHaveLength(1);
  expect(state.characters[0].name).toBe('탑삭부리 한참봉');
  expect(state.characters[0].aliases).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ alias: '한참봉', first_appearance_page: 13 }),
    ])
  );
});

test('FR-DAT-004/A5: 실제 p.304 별명 노트는 p.303 태깅을 보류하고 p.304 근거만 허용한다', () => {
  const face = evidence(303, '고개 를 한참 쳐들어야 얼굴이 보이는 ‘전봇대’다.');
  const nickname = evidence(304, '키가 대중없이 길대서 ‘전봇대’라는 별명이 생긴 같 은 하바꾼이다.');
  const acceptedNote = {
    note: '키가 대중없이 길어서 전봇대라는 별명이 생긴 하바꾼이다.',
    source_page: 304,
    rationale: '원문이 별명의 유래와 하바꾼이라는 설명을 명시한다.',
    evidence: nickname,
  };
  const rejectedNotes = [
    { ...acceptedNote, source_page: 303 },
    { ...acceptedNote, source_page: 303, evidence: { ...nickname, source_page: 303 } },
  ];
  const out = validateGroundedChapter(
    {
      characters: [
        {
          name: '전봇대',
          entity_type: 'person',
          identity_status: 'distinct',
          rationale: '얼굴을 보려 고개를 쳐들어야 하는 인물이다.',
          first_appearance_page: 303,
          evidence: face,
          aliases: [],
          notes: [...rejectedNotes, acceptedNote],
        },
      ],
    },
    pages.filter((p) => p.page_no === 303 || p.page_no === 304)
  );

  expect(out.characters).toHaveLength(1);
  expect(out.characters[0].first_appearance_page).toBe(303);
  expect(out.characters[0].notes).toEqual([acceptedNote]);
  expect(out.review).toHaveLength(2);
  expect(out.review.map(({ kind, candidate }) => ({ kind, candidate }))).toEqual(
    rejectedNotes.map((candidate) => ({ kind: 'note', candidate }))
  );
});

test('FR-DAT-005: 실제 p.304 관계 인용은 p.303 확립 태깅을 보류하고 p.304 근거만 허용한다', () => {
  const proof = evidence(
    304,
    '정주사가 혼자 두런거리는 것을 전봇대가 냉큼 받아, “……우리 같은 사람 가끔 우동 그릇이나 사주구 하면, 다아 하누님이 알아보십넨다!” “하누님이 알어보신다? 허허, 제엔장맞일. 아따 그러세, 우동 한 그릇씩 먹세그려나!”'
  );
  const acceptedRelationship = {
    character_a: '정주사',
    character_b: '전봇대',
    label: '함께 우동을 먹기로 함',
    established_page: 304,
    rationale: '전봇대의 제안에 정주사가 우동 한 그릇씩 먹자고 답한다.',
    evidence: proof,
  };
  const rejectedRelationships = [
    { ...acceptedRelationship, established_page: 303 },
    {
      ...acceptedRelationship,
      established_page: 303,
      evidence: { ...proof, source_page: 303 },
    },
  ];
  const out = validateGroundedChapter(
    { relationships: [...rejectedRelationships, acceptedRelationship] },
    pages.filter((p) => p.page_no === 303 || p.page_no === 304)
  );

  expect(out.relationships).toEqual([acceptedRelationship]);
  expect(out.review).toHaveLength(2);
  expect(out.review.map(({ kind, candidate }) => ({ kind, candidate }))).toEqual(
    rejectedRelationships.map((candidate) => ({ kind: 'relationship', candidate }))
  );
});
