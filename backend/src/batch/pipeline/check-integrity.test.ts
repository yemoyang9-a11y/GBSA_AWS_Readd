import { checkIntegrity, ResolvedBookData } from './check-integrity';
import type { RelationshipSemantics } from '../../shared/types';

const TOTAL_PAGES = 100;

function baseData(): ResolvedBookData {
  return {
    book_id: 'takryu',
    chapter_summaries: [{ chapter_no: 1, title: '1장', summary: '요약' }],
    characters: [
      { id: 'c1', name: '정주사', first_appearance_page: 3, aliases: [], notes: [] },
      { id: 'c2', name: '초봉이', first_appearance_page: 5, aliases: [], notes: [] },
    ],
    relationships: [],
    terms: [],
    events: [],
    background_and_intro: { background: 'bg', intro: 'intro' },
  };
}

describe('checkIntegrity — 정상 데이터는 hard 위반 0건', () => {
  test('기본 데이터는 ok=true', () => {
    const report = checkIntegrity(baseData(), TOTAL_PAGES);
    expect(report.ok).toBe(true);
    expect(report.issues.filter((i) => i.severity === 'hard')).toHaveLength(0);
  });
});

describe('H1 — 페이지 범위 (1..totalPages)', () => {
  test('인물 최초 등장 페이지가 범위 밖이면 hard 위반', () => {
    const data = baseData();
    data.characters[0].first_appearance_page = 0;
    const report = checkIntegrity(data, TOTAL_PAGES);
    expect(report.ok).toBe(false);
    expect(report.issues.some((i) => i.rule === 'H1-page-range')).toBe(true);
  });

  test('페이지가 범위 안이면 위반 없음(positive)', () => {
    const data = baseData();
    data.characters[0].first_appearance_page = 1;
    const report = checkIntegrity(data, TOTAL_PAGES);
    expect(report.issues.filter((i) => i.rule === 'H1-page-range')).toHaveLength(0);
  });

  test('페이지가 null/비정수면 hard 위반', () => {
    const data = baseData();
    data.terms.push({
      id: 't1',
      term: '미두장',
      definition: '...',
      first_appearance_page: null as unknown as number,
    });
    const report = checkIntegrity(data, TOTAL_PAGES);
    expect(report.ok).toBe(false);
  });
});

describe('H2 — 용어 텍스트 중복 (DDL UNIQUE(book_id, term))', () => {
  test('중복 용어는 hard 위반', () => {
    const data = baseData();
    data.terms.push({ id: 't1', term: '미두장', definition: 'a', first_appearance_page: 3 });
    data.terms.push({ id: 't2', term: '미두장', definition: 'b', first_appearance_page: 40 });
    const report = checkIntegrity(data, TOTAL_PAGES);
    expect(report.issues.some((i) => i.rule === 'H2-term-unique')).toBe(true);
  });

  test('서로 다른 용어는 위반 없음(positive)', () => {
    const data = baseData();
    data.terms.push({ id: 't1', term: '미두장', definition: 'a', first_appearance_page: 3 });
    data.terms.push({ id: 't2', term: '하바꾼', definition: 'b', first_appearance_page: 4 });
    const report = checkIntegrity(data, TOTAL_PAGES);
    expect(report.issues.filter((i) => i.rule === 'H2-term-unique')).toHaveLength(0);
  });
});

describe('H3 — 인물 대표명 중복', () => {
  test('같은 이름의 인물이 두 번 생성되면 hard 위반', () => {
    const data = baseData();
    data.characters.push({
      id: 'c3',
      name: '정주사',
      first_appearance_page: 50,
      aliases: [],
      notes: [],
    });
    const report = checkIntegrity(data, TOTAL_PAGES);
    expect(report.issues.some((i) => i.rule === 'H3-character-name-unique')).toBe(true);
  });
});

describe('H4 — 관계의 인물 id FK 무결성', () => {
  test('존재하지 않는 인물 id를 참조하면 hard 위반', () => {
    const data = baseData();
    data.relationships.push({
      id: 'r1',
      character_a_id: 'c1',
      character_b_id: 'no-such-id',
      label: '친구',
      established_page: 10,
    });
    const report = checkIntegrity(data, TOTAL_PAGES);
    expect(report.issues.some((i) => i.rule === 'H4-relationship-fk')).toBe(true);
  });

  test('실제 존재하는 인물끼리의 관계는 위반 없음(positive)', () => {
    const data = baseData();
    data.relationships.push({
      id: 'r1',
      character_a_id: 'c1',
      character_b_id: 'c2',
      label: '부녀',
      established_page: 10,
    });
    const report = checkIntegrity(data, TOTAL_PAGES);
    expect(report.issues.filter((i) => i.rule === 'H4-relationship-fk')).toHaveLength(0);
  });
});

describe('REVIEW — 같은 쌍·같은 페이지에 라벨 충돌', () => {
  test('같은 established_page에 라벨이 다르면 review 항목으로 보고된다(hard 아님)', () => {
    const data = baseData();
    data.relationships.push({
      id: 'r1',
      character_a_id: 'c1',
      character_b_id: 'c2',
      label: '약혼',
      established_page: 30,
    });
    data.relationships.push({
      id: 'r2',
      character_a_id: 'c2',
      character_b_id: 'c1',
      label: '부부',
      established_page: 30,
    });
    const report = checkIntegrity(data, TOTAL_PAGES);
    const found = report.issues.find((i) => i.rule === 'REVIEW-relationship-label-conflict');
    expect(found).toBeDefined();
    expect(found?.severity).toBe('review');
    expect(report.ok).toBe(true); // review는 hard가 아니므로 ok에 영향 없음
  });

  test('같은 페이지에 라벨이 같으면(재서술) 충돌 아님(positive)', () => {
    const data = baseData();
    data.relationships.push({
      id: 'r1',
      character_a_id: 'c1',
      character_b_id: 'c2',
      label: '약혼',
      established_page: 30,
    });
    data.relationships.push({
      id: 'r2',
      character_a_id: 'c1',
      character_b_id: 'c2',
      label: '약혼',
      established_page: 30,
    });
    const report = checkIntegrity(data, TOTAL_PAGES);
    expect(
      report.issues.filter((i) => i.rule === 'REVIEW-relationship-label-conflict')
    ).toHaveLength(0);
  });
});

describe('REVIEW — 같은 관계 묶음·같은 페이지 라벨 충돌 (FR-CHR-001)', () => {
  const sem = (direction: RelationshipSemantics['direction']): RelationshipSemantics => ({
    version: 2,
    direction,
    kind: 'emotion',
    relation_key: 'affection',
    summary: '요약',
    assertion_status: 'fact',
    temporal_scope: 'ongoing',
    state: 'active',
    evidence: { source_page: 30, quote: 'q', start_char: 0, end_char: 1 },
  });
  const conflicts = (data: ResolvedBookData) =>
    checkIntegrity(data, TOTAL_PAGES).issues.filter(
      (i) => i.rule === 'REVIEW-relationship-label-conflict'
    );

  test('방향만 다른 같은 관계(한쪽→쌍방)가 같은 페이지에 라벨이 다르면 review 항목', () => {
    const data = baseData();
    data.relationships.push(
      {
        id: 'r1',
        character_a_id: 'c1',
        character_b_id: 'c2',
        label: '연모',
        established_page: 30,
        semantics: sem('a_to_b'),
      },
      {
        id: 'r2',
        character_a_id: 'c1',
        character_b_id: 'c2',
        label: '연인',
        established_page: 30,
        semantics: sem('mutual'),
      }
    );
    expect(conflicts(data)).toHaveLength(1);
  });

  test('반대 방향 한쪽 관계끼리는 칸이 달라 충돌이 아니다(positive)', () => {
    const data = baseData();
    data.relationships.push(
      {
        id: 'r1',
        character_a_id: 'c1',
        character_b_id: 'c2',
        label: '연모',
        established_page: 30,
        semantics: sem('a_to_b'),
      },
      {
        id: 'r2',
        character_a_id: 'c1',
        character_b_id: 'c2',
        label: '무관심',
        established_page: 30,
        semantics: sem('b_to_a'),
      }
    );
    expect(conflicts(data)).toHaveLength(0);
  });
});

describe('REVIEW — name형 별칭이 여러 인물에게 쓰이는 경우', () => {
  test('같은 name형 별칭을 두 인물이 공유하면 review 항목', () => {
    const data = baseData();
    data.characters[0].aliases.push({ alias: '정 주사', type: 'name', first_appearance_page: 3 });
    data.characters[1].aliases.push({ alias: '정 주사', type: 'name', first_appearance_page: 5 });
    const report = checkIntegrity(data, TOTAL_PAGES);
    const found = report.issues.find((i) => i.rule === 'REVIEW-ambiguous-name-alias');
    expect(found).toBeDefined();
    expect(found?.severity).toBe('review');
  });

  test('kinship/title형 별칭이 여러 인물에게 쓰이는 건 정상(예: "아주머니")(positive)', () => {
    const data = baseData();
    data.characters[0].aliases.push({
      alias: '아주머니',
      type: 'kinship',
      first_appearance_page: 3,
    });
    data.characters[1].aliases.push({
      alias: '아주머니',
      type: 'kinship',
      first_appearance_page: 5,
    });
    const report = checkIntegrity(data, TOTAL_PAGES);
    expect(report.issues.filter((i) => i.rule === 'REVIEW-ambiguous-name-alias')).toHaveLength(0);
  });
});
