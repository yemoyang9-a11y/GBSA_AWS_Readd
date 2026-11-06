/**
 * 챗봇 관계 근거의 의미 필드 — PR 99 리뷰(2026-10-28)
 *
 * 관계 파이프라인이 belief·rumor·negated 관계와 방향(direction)을 저장하게 됐는데, 챗봇은
 * label만 읽어 "A - B: 라벨"로 렌더링했다. 부정된 관계가 사실처럼, b_to_a 관계가 주어·목적어가
 * 뒤바뀐 채로 모델에 들어간다. 근거에 실린 의미 필드가 프롬프트에 그대로 실리는지 고정한다.
 */

import { pool } from '../../../config/database';
import { buildPrompt } from '../context-assembly';
import * as repo from '../repository';
import type { ChatbotContext, Relationship, RelationshipSemantics } from '../../../shared/types';

jest.mock('../../../config/database', () => ({ pool: { query: jest.fn() } }));

const characters = [
  { id: 'c1', book_id: 'book', name: '초봉', first_appearance_page: 1 },
  { id: 'c2', book_id: 'book', name: '제호', first_appearance_page: 2 },
  { id: 'c3', book_id: 'book', name: '정주사', first_appearance_page: 1 },
];

function semantics(overrides: Partial<RelationshipSemantics>): RelationshipSemantics {
  return {
    version: 2,
    direction: 'a_to_b',
    kind: 'social',
    relation_key: 'test',
    summary: '요약',
    assertion_status: 'fact',
    temporal_scope: 'ongoing',
    state: 'active',
    evidence: { source_page: 10, quote: '인용', start_char: 0, end_char: 2 },
    ...overrides,
  };
}

function promptWith(relationships: Relationship[]): string {
  const context: ChatbotContext = {
    book: { title: '', author: '' },
    chapter_summaries: [],
    current_chapter_text: null,
    entities: { characters, relationships, character_notes: [], terms: [], events: [] },
    background: '',
  };
  return buildPrompt(context, '(규칙)');
}

function rel(overrides: Partial<Relationship>): Relationship {
  return {
    id: 'r1',
    book_id: 'book',
    character_a_id: 'c1',
    character_b_id: 'c2',
    label: '라벨',
    established_page: 10,
    ...overrides,
  };
}

describe('챗봇 관계 근거 렌더링 — 의미 필드', () => {
  test('R10: 부정된 관계는 사실 라벨처럼 렌더링되지 않는다', () => {
    const prompt = promptWith([
      rel({
        character_a_id: 'c3',
        character_b_id: 'c1',
        label: '아버지다',
        semantics: semantics({
          direction: 'a_to_b',
          kind: 'family',
          assertion_status: 'negated',
          summary: '정주사는 초봉의 아버지가 아니라고 부정된다',
        }),
      }),
    ]);

    expect(prompt).not.toMatch(/^- 정주사 - 초봉: 아버지다 \(확립/m);
    expect(prompt).toContain('[부정 — 성립하지 않음]');
    expect(prompt).toContain('정주사는 초봉의 아버지가 아니라고 부정된다');
  });

  test('FR-CHR-001: b_to_a 관계는 저장 순서가 아니라 방향대로 주어·목적어를 쓴다', () => {
    const prompt = promptWith([
      rel({
        label: '협박한다',
        semantics: semantics({
          direction: 'b_to_a',
          kind: 'action',
          summary: '제호가 초봉을 협박한다',
        }),
      }),
    ]);

    expect(prompt).toContain('- 제호 → 초봉:');
    expect(prompt).not.toContain('- 초봉 - 제호:');
  });

  test('R10: 인물의 믿음은 믿음의 주체와 함께 사실과 구분되어 실린다', () => {
    const prompt = promptWith([
      rel({
        label: '연인이다',
        semantics: semantics({
          direction: 'mutual',
          kind: 'emotion',
          assertion_status: 'belief',
          attribution: '정주사',
          summary: '정주사는 둘이 연인이라고 믿는다',
        }),
      }),
    ]);

    expect(prompt).toContain('- 초봉 ↔ 제호: [인물의 믿음(정주사)] 연인이다');
  });

  test('R10: 끝난 관계는 종료됐다고 표시한다', () => {
    const prompt = promptWith([
      rel({
        label: '고용 관계',
        semantics: semantics({ state: 'ended', summary: '고용이 끝났다' }),
      }),
    ]);

    expect(prompt).toContain('- 초봉 → 제호: [사실, 종료됨] 고용 관계');
  });

  test('A6: 의미 필드가 없는 기존 관계는 지금과 같은 형식으로 남는다', () => {
    const prompt = promptWith([
      rel({ character_a_id: 'c3', character_b_id: 'c1', label: '부녀', established_page: 3 }),
    ]);

    expect(prompt).toContain('- 정주사 - 초봉: 부녀 (확립: p.3)');
  });
});

describe('챗봇 관계 조회 — 의미 필드와 근거 검증', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (pool.query as jest.Mock).mockResolvedValue({ rows: [] });
  });

  test('FR-QNA-006: 관계 조회는 semantics를 함께 읽고, 그 근거 인용을 기준점 안 페이지에서 확인한다', async () => {
    await repo.findRelationships('book', 40);
    const [sql, params] = (pool.query as jest.Mock).mock.calls[0];

    expect(sql).toMatch(/r\.semantics/);
    expect(sql).toMatch(/proof\.page_no\s*<=\s*\$2/);
    expect(sql).toMatch(/strpos\(proof\.content/);
    expect(sql).toMatch(/r\.semantics IS NULL OR/);
    expect(params).toEqual(['book', 40]);
  });
});
