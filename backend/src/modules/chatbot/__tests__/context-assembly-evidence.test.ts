/**
 * 근거 조립 - 질의 비관여 테스트
 *
 * 명세 5.5절 - 7번 테스트:
 * "같은 K에서 질의를 10개 바꿔도 ①②③이 완전히 같아야 한다"
 *
 * NFR-SEC-006 🚦: assembleContext는 query를 인자로 받지 않음
 * → 질의와 무관하게 항상 같은 근거를 반환
 */

import { assembleContext } from '../context-assembly';
import * as repo from '../repository';

// Repository 모킹
jest.mock('../repository');

describe('근거 조립 - 질의 비관여 (명세 5.5절 #7)', () => {
  const BOOK_ID = 'takryu-vol1';
  const K = 80;

  const mockChapterSummaries = [
    {
      id: 'ch-1',
      book_id: BOOK_ID,
      chapter_no: 1,
      title: '1장',
      start_page: 1,
      end_page: 50,
      summary: '정주사 등장',
    },
    {
      id: 'ch-2',
      book_id: BOOK_ID,
      chapter_no: 2,
      title: '2장',
      start_page: 51,
      end_page: 80,
      summary: '초봉 등장',
    },
  ];

  const mockCharacters = [
    {
      id: 'char-1',
      book_id: BOOK_ID,
      name: '정주사',
      first_appearance_page: 10,
      description: '고무신 장사',
    },
    {
      id: 'char-2',
      book_id: BOOK_ID,
      name: '초봉',
      first_appearance_page: 25,
      description: '아름다운 여성',
    },
  ];

  const mockRelationships = [
    {
      id: 'rel-1',
      book_id: BOOK_ID,
      source_character_id: 'char-1',
      target_character_id: 'char-2',
      relationship_type: 'interest',
      established_page: 30,
      label: '관심',
    },
  ];

  const mockBackground = [
    {
      id: 'bg-1',
      book_id: BOOK_ID,
      category: 'historical',
      title: '일제강점기',
      content: '1930년대 배경',
    },
  ];

  beforeEach(() => {
    // Repository 함수들 모킹
    (repo.findChapterSummaries as jest.Mock).mockResolvedValue(mockChapterSummaries);
    (repo.getCurrentChapterText as jest.Mock).mockResolvedValue('현재 장 본문...');
    (repo.findCharacters as jest.Mock).mockResolvedValue(mockCharacters);
    (repo.findRelationships as jest.Mock).mockResolvedValue(mockRelationships);
    (repo.findCharacterNotes as jest.Mock).mockResolvedValue([]);
    (repo.findTerms as jest.Mock).mockResolvedValue([]);
    (repo.findEvents as jest.Mock).mockResolvedValue([]);
    (repo.getBackgroundKnowledge as jest.Mock).mockResolvedValue(mockBackground);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('명세 5.5절 #7: 같은 K에서 질의를 10개 바꿔도 전량 주입분은 완전히 동일', async () => {
    // assembleContext는 query를 인자로 받지 않으므로
    // 같은 K로 10번 호출하면 항상 같은 결과를 반환해야 함

    const contexts = [];

    // 10번 호출 (질의가 달라도 assembleContext는 질의를 받지 않음)
    for (let i = 0; i < 10; i++) {
      const context = await assembleContext(BOOK_ID, K);
      contexts.push(context);
    }

    // 모든 컨텍스트가 동일해야 함
    for (let i = 1; i < 10; i++) {
      // 장 요약 동일
      expect(contexts[i].chapter_summaries).toEqual(contexts[0].chapter_summaries);

      // 현재 장 본문 동일
      expect(contexts[i].current_chapter_text).toEqual(contexts[0].current_chapter_text);

      // 엔티티 동일
      expect(contexts[i].entities.characters).toEqual(contexts[0].entities.characters);
      expect(contexts[i].entities.relationships).toEqual(contexts[0].entities.relationships);
      expect(contexts[i].entities.character_notes).toEqual(contexts[0].entities.character_notes);
      expect(contexts[i].entities.terms).toEqual(contexts[0].entities.terms);
      expect(contexts[i].entities.events).toEqual(contexts[0].entities.events);

      // 배경지식 동일
      expect(contexts[i].background).toEqual(contexts[0].background);
    }

    // Repository 호출 횟수 확인 (캐싱 없이 매번 호출)
    expect(repo.findChapterSummaries).toHaveBeenCalledTimes(10);
    expect(repo.findCharacters).toHaveBeenCalledTimes(10);
    expect(repo.findRelationships).toHaveBeenCalledTimes(10);

    // 모든 호출이 같은 K 값으로 이루어짐
    for (let i = 0; i < 10; i++) {
      expect(repo.findChapterSummaries).toHaveBeenNthCalledWith(i + 1, BOOK_ID, K);
      expect(repo.findCharacters).toHaveBeenNthCalledWith(i + 1, BOOK_ID, K);
      expect(repo.findRelationships).toHaveBeenNthCalledWith(i + 1, BOOK_ID, K);
    }
  });

  test('명세 5.5절 #7 증명: assembleContext는 query 인자가 없음 (타입 수준)', () => {
    // TypeScript 컴파일 시점에 보장
    // assembleContext(bookId: string, K: number) - query 인자 없음

    expect(assembleContext.length).toBe(2); // 정확히 2개 인자만 받음
  });

  test('FR-QNA-006 🚦: 조립된 엔티티가 모두 <= K', async () => {
    const context = await assembleContext(BOOK_ID, K);

    // 인물 확립 페이지 검증
    context.entities.characters.forEach(char => {
      expect(char.first_appearance_page).toBeLessThanOrEqual(K);
    });

    // 관계 확립 페이지 검증
    context.entities.relationships.forEach(rel => {
      expect(rel.established_page).toBeLessThanOrEqual(K);
    });

    // 장 요약 종료 페이지 검증
    context.chapter_summaries.forEach(ch => {
      expect(ch.end_page).toBeLessThanOrEqual(K);
    });
  });

  test('FR-BGK-002 🚦: 배경지식은 K와 무관 (상한 없음)', async () => {
    const context1 = await assembleContext(BOOK_ID, 10);   // K=10
    const context2 = await assembleContext(BOOK_ID, 200);  // K=200

    // 배경지식은 K가 달라도 동일해야 함
    expect(context1.background).toEqual(context2.background);

    // getBackgroundKnowledge는 K 인자를 받지 않음
    expect(repo.getBackgroundKnowledge).toHaveBeenCalledWith(BOOK_ID);
  });
});
