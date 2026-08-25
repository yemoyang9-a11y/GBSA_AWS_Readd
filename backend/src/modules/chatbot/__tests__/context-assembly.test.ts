/**
 * 근거 조립 테스트
 *
 * NFR-SEC-006 🚦: assembleContext는 query를 인자로 받지 않음
 * FR-QNA-006 🚦: 모든 엔티티 조회는 <= K 필터
 */

import { assembleContext, buildPrompt } from '../context-assembly';
import type { ChatbotContext } from '../../../shared/types';

describe('근거 조립 - NFR-SEC-006 🚦', () => {
  test('NFR-SEC-006: assembleContext 함수는 질의 텍스트를 인자로 받지 않음', () => {
    // TypeScript 타입으로 보장: assembleContext(bookId: string, K: number)
    // 질의 텍스트 인자 없음

    // 함수를 호출해서 인자 수 검증
    // 정확히 2개 인자만 받음 (bookId, K)
    expect(assembleContext.length).toBe(2);
  });

  test('NFR-SEC-006: 같은 K에서 질의를 바꿔도 전량 주입분은 동일해야 함', async () => {
    // Mock repository를 사용한 테스트
    // TODO: repository mock 추가 후 구현
    // const context1 = await assembleContext('book-123', 80);
    // const context2 = await assembleContext('book-123', 80);
    //
    // // 같은 K면 전량 주입분은 동일
    // expect(context1.chapter_summaries).toEqual(context2.chapter_summaries);
    // expect(context1.entities).toEqual(context2.entities);
    // expect(context1.background).toEqual(context2.background);
  });
});

describe('근거 조립 범위 - FR-QNA-006 🚦', () => {
  test('FR-QNA-006: 조립된 컨텍스트 내 모든 엔티티는 <= K', async () => {
    // Mock repository를 사용한 테스트
    // TODO: repository mock 추가 후 구현
    // const K = 80;
    // const context = await assembleContext('book-123', K);
    //
    // // 모든 엔티티가 K 이하
    // context.entities.characters.forEach(char => {
    //   expect(char.first_appearance_page).toBeLessThanOrEqual(K);
    // });
    //
    // context.entities.relationships.forEach(rel => {
    //   expect(rel.established_page).toBeLessThanOrEqual(K);
    // });
    //
    // context.entities.terms.forEach(term => {
    //   expect(term.first_appearance_page).toBeLessThanOrEqual(K);
    // });
    //
    // context.entities.events.forEach(event => {
    //   expect(event.occurrence_page).toBeLessThanOrEqual(K);
    // });
  });

  test('FR-QNA-006: 장 요약은 end_page <= K만 포함', async () => {
    // TODO: repository mock 추가 후 구현
    // const K = 80;
    // const context = await assembleContext('book-123', K);
    //
    // context.chapter_summaries.forEach(ch => {
    //   expect(ch.end_page).toBeLessThanOrEqual(K);
    // });
  });
});

describe('관계 프롬프트 렌더링 - FR-QNA-006 🚦', () => {
  // 2026-08-25 사용자 제보: "정주사 아들 누구야?"는 [NO_EVIDENCE]인데
  // "병주 아버지 누구야?"는 맞히는 비대칭 발생. character_a_id/character_b_id가
  // uuidv4()라 사람이 읽을 수 없는데, buildPrompt가 그동안 이름 해석 없이
  // rel.label만 넣어서 "누구의" 관계인지 모델이 알 방법이 없었던 게 원인.
  const baseContext: ChatbotContext = {
    chapter_summaries: [],
    current_chapter_text: null,
    entities: {
      characters: [
        { id: 'char-jeongjusa', book_id: 'takryu-vol1', name: '정주사', first_appearance_page: 3 },
        { id: 'char-byeongju', book_id: 'takryu-vol1', name: '병주', first_appearance_page: 3 },
      ],
      relationships: [
        {
          id: 'rel-1',
          book_id: 'takryu-vol1',
          character_a_id: 'char-jeongjusa',
          character_b_id: 'char-byeongju',
          label: '부자',
          established_page: 3,
        },
      ],
      character_notes: [],
      terms: [],
      events: [],
    },
    background: '',
  };

  test('관계 목록에 당사자 이름이 라벨과 함께 포함된다 (uuid 그대로 노출되지 않음)', () => {
    const prompt = buildPrompt(baseContext, '');

    expect(prompt).toContain('정주사');
    expect(prompt).toContain('병주');
    expect(prompt).toContain('부자');
    expect(prompt).not.toContain('char-jeongjusa');
    expect(prompt).not.toContain('char-byeongju');
  });

  test('이름을 못 찾으면(불일치 데이터) id로 폴백하되 죽지 않는다', () => {
    const context: ChatbotContext = {
      ...baseContext,
      entities: { ...baseContext.entities, characters: [] },
    };

    expect(() => buildPrompt(context, '')).not.toThrow();
    expect(buildPrompt(context, '')).toContain('char-jeongjusa');
  });
});

describe('인물 노트 프롬프트 렌더링 - FR-QNA-006 🚦', () => {
  // 2026-08-25: assembleContext는 character_notes를 조회해 로그에도 근거로
  // 기록했지만 buildPrompt는 렌더링하지 않아, 인물 노트에만 있는 정보를 묻는
  // 질문이 항상 [NO_EVIDENCE]였던 버그.
  test('인물 노트가 프롬프트에 실제로 포함된다', () => {
    const context: ChatbotContext = {
      chapter_summaries: [],
      current_chapter_text: null,
      entities: {
        characters: [
          { id: 'char-jeongjusa', book_id: 'takryu-vol1', name: '정주사', first_appearance_page: 3 },
        ],
        relationships: [],
        character_notes: [
          { id: 'note-1', character_id: 'char-jeongjusa', note: '한때 마름 노릇을 했다', source_page: 5 },
        ],
        terms: [],
        events: [],
      },
      background: '',
    };

    const prompt = buildPrompt(context, '');

    expect(prompt).toContain('정주사');
    expect(prompt).toContain('한때 마름 노릇을 했다');
    expect(prompt).not.toContain('char-jeongjusa');
  });
});

describe('배경지식 - FR-BGK-002 🚦', () => {
  test('FR-BGK-002: 배경지식은 K와 무관 (상한 없음)', async () => {
    // TODO: repository mock 추가 후 구현
    // const context1 = await assembleContext('book-123', 10);   // K=10
    // const context2 = await assembleContext('book-123', 200);  // K=200
    //
    // // 배경지식은 K가 달라도 동일
    // expect(context1.background).toEqual(context2.background);
  });
});
