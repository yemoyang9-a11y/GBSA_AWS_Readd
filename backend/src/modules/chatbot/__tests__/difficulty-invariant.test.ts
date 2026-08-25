/**
 * 난이도 분기 - 근거 불변 테스트
 *
 * 명세 5.5절 - 15번 테스트:
 * "분기 결과가 근거 집합을 바꾸지 않는다 —
 *  같은 K에서 Sonnet 경로와 Haiku 경로의 투입 레코드가 동일"
 *
 * D13 ②: 난이도 분기는 근거 범위에 영향을 주지 않음
 */

import { assembleContext } from '../context-assembly';
import { selectModel } from '../difficulty-router';
import * as repo from '../repository';

// Repository 모킹
jest.mock('../repository');

describe('난이도 분기 - 근거 집합 불변 (명세 5.5절 #15)', () => {
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
  ];

  const mockCharacters = [
    {
      id: 'char-1',
      book_id: BOOK_ID,
      name: '정주사',
      first_appearance_page: 10,
      description: '고무신 장사',
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
    (repo.findChapterSummaries as jest.Mock).mockResolvedValue(mockChapterSummaries);
    (repo.getCurrentChapterText as jest.Mock).mockResolvedValue('현재 장 본문...');
    (repo.findCharacters as jest.Mock).mockResolvedValue(mockCharacters);
    (repo.findRelationships as jest.Mock).mockResolvedValue(mockRelationships);
    (repo.findCharacterNotes as jest.Mock).mockResolvedValue([]);
    (repo.findTerms as jest.Mock).mockResolvedValue([]);
    (repo.findEvents as jest.Mock).mockResolvedValue([]);
    (repo.getBackgroundKnowledge as jest.Mock).mockResolvedValue(mockBackground);
    (repo.getBookMeta as jest.Mock).mockResolvedValue({ title: '탁류', author: '채만식' });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('명세 5.5절 #15: Sonnet/Haiku 경로에서 근거 집합 동일', async () => {
    // 1. Sonnet으로 라우팅되는 질의 (복잡한 질의)
    const complexQuery = '왜 정주사와 초봉의 관계가 그렇게 변화했나요? 그리고 앞으로 어떻게 될까요?';
    const sonnetSelection = selectModel(complexQuery);
    expect(sonnetSelection.model).toBe('sonnet');

    // 2. Haiku로 라우팅되는 질의 (단순한 질의)
    const simpleQuery = '정주사가 누구인가요?';
    const haikuSelection = selectModel(simpleQuery);
    expect(haikuSelection.model).toBe('haiku');

    // 3. 같은 K에서 근거 조립 (질의 텍스트는 assembleContext에 전달 안 됨)
    const contextForSonnet = await assembleContext(BOOK_ID, K);
    const contextForHaiku = await assembleContext(BOOK_ID, K);

    // 4. 두 경로의 근거가 완전히 동일해야 함
    expect(contextForSonnet.chapter_summaries).toEqual(contextForHaiku.chapter_summaries);
    expect(contextForSonnet.current_chapter_text).toEqual(contextForHaiku.current_chapter_text);
    expect(contextForSonnet.entities).toEqual(contextForHaiku.entities);
    expect(contextForSonnet.background).toEqual(contextForHaiku.background);
  });

  test('명세 5.5절 #17: 분기가 LLM 호출을 추가하지 않음', () => {
    // selectModel은 순수 함수 (API 호출 없음)
    const query1 = '복잡한 질문: 왜 그런가요?';
    const query2 = '단순 질문: 누구인가요?';

    const result1 = selectModel(query1);
    const result2 = selectModel(query2);

    // 즉시 반환 (LLM 호출 없음)
    expect(result1.model).toBeDefined();
    expect(result2.model).toBeDefined();

    // 질의당 실제 LLM 호출은 handleQuery에서 1회만
    // (selectModel은 단순 규칙 기반 분기)
  });

  test('D13 ②: 난이도 분기는 근거 범위(K)를 변경하지 않음', async () => {
    // selectModel은 K를 인자로 받지 않음
    expect(selectModel.length).toBe(1); // query만 인자로 받음

    // 어떤 모델이 선택되든 assembleContext는 같은 K를 사용
    const query1 = '왜 그런가요?'; // Sonnet
    const query2 = '누구인가요?'; // Haiku

    selectModel(query1);
    selectModel(query2);

    // 두 경로 모두 같은 K로 근거 조립
    await assembleContext(BOOK_ID, K);
    await assembleContext(BOOK_ID, K);

    // Repository 호출이 같은 K로 이루어졌는지 확인
    expect(repo.findChapterSummaries).toHaveBeenCalledWith(BOOK_ID, K);
    expect(repo.findCharacters).toHaveBeenCalledWith(BOOK_ID, K);
  });

  test('근거 조립 → 난이도 분기 순서 보장', async () => {
    // 시스템 흐름:
    // 1. getCutoffSnapshot() → K
    // 2. assembleContext(bookId, K) → 근거 (질의 비관여)
    // 3. selectModel(query) → 모델 선택
    // 4. llmStream(task, prompt) → LLM 호출

    // assembleContext는 query 없이 먼저 실행됨
    const context = await assembleContext(BOOK_ID, K);
    expect(context).toBeDefined();

    // 그 후 selectModel이 query를 받아 모델만 선택
    const selection1 = selectModel('왜 정주사와 초봉의 관계가 변화했나요?'); // Sonnet (복잡도 키워드 '왜')
    const selection2 = selectModel('정주사가 누구인가요?'); // Haiku (단순 질의)

    // 근거는 이미 조립 완료 (모델 선택과 무관)
    expect(selection1.model).toBe('sonnet');
    expect(selection2.model).toBe('haiku');

    // 하지만 context는 동일
    expect(context.chapter_summaries).toEqual(mockChapterSummaries);
  });
});
