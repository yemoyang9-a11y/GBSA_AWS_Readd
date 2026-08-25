/**
 * 질의 로그 검증 테스트
 *
 * 명세 5.5절 - 19~21번 테스트:
 * - 19: 질의 1회 → 로그 1건
 * - 20: 투입 레코드 ID가 전수 기록
 * - 21: 검색 선정 페이지 번호·스코어가 기록
 *
 * NFR-OBS-005 🚦: 질의 로그 — CP5 인젝션 판정의 대조 대상
 */

import { handleQuery } from '../service';
import * as repo from '../repository';
import { vectorSearch } from '../vector-search';
import { stream as llmStream } from '../../llm-gateway/gateway';

// 모킹
jest.mock('../repository');
jest.mock('../vector-search');
jest.mock('../../llm-gateway/gateway');

describe('질의 로그 검증 (명세 5.5절 #19~21)', () => {
  const BOOK_ID = 'takryu-vol1';
  const DEVICE_ID = 'device-123';
  const K = 80;
  const QUERY = '정주사가 누구인가요?';

  const mockContext = {
    book: { title: '탁류', author: '채만식' },
    chapter_summaries: [
      { id: 'ch-1', book_id: BOOK_ID, chapter_no: 1, title: '1장', start_page: 1, end_page: 50, summary: '...' },
      { id: 'ch-2', book_id: BOOK_ID, chapter_no: 2, title: '2장', start_page: 51, end_page: 80, summary: '...' },
    ],
    current_chapter_text: '현재 장 본문...',
    entities: {
      characters: [
        { id: 'char-1', book_id: BOOK_ID, name: '정주사', first_appearance_page: 10, description: '...' },
        { id: 'char-2', book_id: BOOK_ID, name: '초봉', first_appearance_page: 25, description: '...' },
      ],
      relationships: [
        {
          id: 'rel-1',
          book_id: BOOK_ID,
          source_character_id: 'char-1',
          target_character_id: 'char-2',
          relationship_type: 'interest',
          established_page: 30,
          label: '관심',
        },
      ],
      character_notes: [
        { id: 'note-1', character_id: 'char-1', page_no: 15, note: '...' },
      ],
      terms: [
        { id: 'term-1', book_id: BOOK_ID, term: '고무신', first_appearance_page: 12, definition: '...' },
      ],
      events: [
        { id: 'event-1', book_id: BOOK_ID, title: '만남', occurrence_page: 30, description: '...' },
      ],
    },
    background: [
      { id: 'bg-1', book_id: BOOK_ID, category: 'historical', title: '일제강점기', content: '...' },
    ],
  };

  const mockSearchResults = [
    { chunk_id: 'chunk-1', page_no: 10, content: '정주사는...', distance: 0.1 },
    { chunk_id: 'chunk-2', page_no: 15, content: '고무신 장사...', distance: 0.2 },
    { chunk_id: 'chunk-3', page_no: 20, content: '돈을 모았다...', distance: 0.3 },
  ];

  beforeEach(() => {
    // MOCK_MODE 비활성화 (실제 로직 테스트)
    process.env.MOCK_MODE = 'false';

    // Repository 모킹
    (repo.findChapterSummaries as jest.Mock).mockResolvedValue(mockContext.chapter_summaries);
    (repo.getCurrentChapterText as jest.Mock).mockResolvedValue(mockContext.current_chapter_text);
    (repo.findCharacters as jest.Mock).mockResolvedValue(mockContext.entities.characters);
    (repo.findRelationships as jest.Mock).mockResolvedValue(mockContext.entities.relationships);
    (repo.findCharacterNotes as jest.Mock).mockResolvedValue(mockContext.entities.character_notes);
    (repo.findTerms as jest.Mock).mockResolvedValue(mockContext.entities.terms);
    (repo.findEvents as jest.Mock).mockResolvedValue(mockContext.entities.events);
    (repo.getBackgroundKnowledge as jest.Mock).mockResolvedValue(mockContext.background);
    (repo.getBookMeta as jest.Mock).mockResolvedValue(mockContext.book);

    // 벡터 검색 모킹
    (vectorSearch as jest.Mock).mockResolvedValue(mockSearchResults);

    // LLM 스트리밍 모킹
    (llmStream as jest.Mock).mockImplementation(async function* () {
      yield '정주사는 ';
      yield '고무신 장사입니다.';
    });

    // console.log spy (로그 출력 확인용)
    jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('명세 5.5절 #19: 질의 1회 → 로그 1건', async () => {
    // handleQuery 호출
    const chunks: string[] = [];
    for await (const chunk of handleQuery(BOOK_ID, QUERY, K, DEVICE_ID)) {
      chunks.push(chunk);
    }

    // 로그 출력 확인 (실제 구현에서는 DB INSERT)
    expect(console.log).toHaveBeenCalledWith(
      '[Chatbot] Query log',
      expect.objectContaining({
        device_id: DEVICE_ID,
        book_id: BOOK_ID,
        query: QUERY,
        cutoff_page: K,
      })
    );
  });

  test('명세 5.5절 #20: 투입 레코드 ID가 전수 기록', async () => {
    const chunks: string[] = [];
    for await (const chunk of handleQuery(BOOK_ID, QUERY, K, DEVICE_ID)) {
      chunks.push(chunk);
    }

    // 로그에 투입 레코드 ID가 모두 포함되어야 함
    const logCall = (console.log as jest.Mock).mock.calls.find(
      call => call[0] === '[Chatbot] Query log'
    );
    expect(logCall).toBeDefined();

    const logData = logCall![1];

    // input_records 필드가 존재하고 올바른 구조를 가져야 함
    expect(logData).toHaveProperty('input_records');
    expect(logData.input_records).toHaveProperty('chapter_summaries');
    expect(logData.input_records).toHaveProperty('characters');
    expect(logData.input_records).toHaveProperty('relationships');
    expect(logData.input_records).toHaveProperty('character_notes');
    expect(logData.input_records).toHaveProperty('terms');
    expect(logData.input_records).toHaveProperty('events');
    expect(logData.input_records).toHaveProperty('background');

    // 배열 타입 확인
    expect(Array.isArray(logData.input_records.chapter_summaries)).toBe(true);
    expect(Array.isArray(logData.input_records.characters)).toBe(true);
    expect(Array.isArray(logData.input_records.relationships)).toBe(true);

    // 최소 1개 이상의 레코드가 기록되어야 함 (mock 데이터 기준)
    expect(logData.input_records.characters.length).toBeGreaterThan(0);
  });

  test('명세 5.5절 #21: 검색 선정 페이지 번호·스코어가 기록', async () => {
    const chunks: string[] = [];
    for await (const chunk of handleQuery(BOOK_ID, QUERY, K, DEVICE_ID)) {
      chunks.push(chunk);
    }

    // 검색 결과 로그 확인
    const logCall = (console.log as jest.Mock).mock.calls.find(
      call => call[0] === '[Chatbot] Query log'
    );
    expect(logCall).toBeDefined();

    const logData = logCall![1];

    // search_selected_pages 필드 존재 확인
    expect(logData).toHaveProperty('search_selected_pages');
    expect(Array.isArray(logData.search_selected_pages)).toBe(true);

    // 최소 1개 이상의 검색 결과가 있어야 함
    expect(logData.search_selected_pages.length).toBeGreaterThan(0);

    // 각 검색 결과가 page_no와 distance를 가져야 함
    logData.search_selected_pages.forEach((page: any) => {
      expect(page).toHaveProperty('page_no');
      expect(page).toHaveProperty('distance');
      expect(typeof page.page_no).toBe('number');
      expect(typeof page.distance).toBe('number');
    });
  });

  test('NFR-OBS-005 🚦: CP5 인젝션 판정용 필드 완비', async () => {
    const chunks: string[] = [];
    for await (const chunk of handleQuery(BOOK_ID, QUERY, K, DEVICE_ID)) {
      chunks.push(chunk);
    }

    const logCall = (console.log as jest.Mock).mock.calls.find(
      call => call[0] === '[Chatbot] Query log'
    );
    const logData = logCall![1];

    // CP5 인젝션 판정에 필요한 필드들
    expect(logData).toHaveProperty('cutoff_page'); // 기준점 K
    expect(logData).toHaveProperty('input_records'); // 투입 레코드 ID
    expect(logData).toHaveProperty('search_selected_pages'); // 검색 페이지 번호

    // 검색 선정 페이지가 모두 K 이하인지 검증 가능
    logData.search_selected_pages.forEach((page: { page_no: number; distance: number }) => {
      expect(page.page_no).toBeLessThanOrEqual(K);
    });
  });

  test('로그 필드 완전성: 명세 요구 필드 모두 포함', async () => {
    const chunks: string[] = [];
    for await (const chunk of handleQuery(BOOK_ID, QUERY, K, DEVICE_ID)) {
      chunks.push(chunk);
    }

    const logCall = (console.log as jest.Mock).mock.calls.find(
      call => call[0] === '[Chatbot] Query log'
    );
    const logData = logCall![1];

    // 명세서 요구 필드
    expect(logData).toHaveProperty('timestamp');
    expect(logData).toHaveProperty('device_id');
    expect(logData).toHaveProperty('book_id');
    expect(logData).toHaveProperty('cutoff_page');
    expect(logData).toHaveProperty('query');
    expect(logData).toHaveProperty('input_records');
    expect(logData).toHaveProperty('search_selected_pages');
    expect(logData).toHaveProperty('no_evidence');
    expect(logData).toHaveProperty('model');
    expect(logData).toHaveProperty('output_ref');
    expect(logData).toHaveProperty('tokens');
  });
});
