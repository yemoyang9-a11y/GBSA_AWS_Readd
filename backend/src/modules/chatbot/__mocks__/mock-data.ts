/**
 * Mock 데이터 (테스트용)
 *
 * DB와 Bedrock 없이 테스트 가능
 */

import type {
  ChatbotContext,
  ChatbotChapterSummary,
  Character,
  Relationship,
  SearchChunk,
} from '../../../shared/types';

/**
 * Mock 챗봇 컨텍스트
 */
export function getMockContext(K: number): ChatbotContext {
  return {
    book: { title: '탁류', author: '채만식' },
    chapter_summaries: getMockChapterSummaries(K),
    current_chapter_text: getMockCurrentChapter(K),
    entities: {
      characters: getMockCharacters(K),
      relationships: getMockRelationships(K),
      character_notes: [],
      terms: [],
      events: [],
    },
    background: '「탁류」는 채만식의 대표작으로, 1930년대 한국 사회의 모습을 그린 장편소설입니다.',
  };
}

function getMockChapterSummaries(K: number): ChatbotChapterSummary[] {
  const all = [
    {
      chapter_no: 1,
      title: '1장',
      content: '정주사가 고무신 장사로 돈을 모으는 이야기',
      start_page: 1,
      end_page: 20,
    },
    {
      chapter_no: 2,
      title: '2장',
      content: '초봉이가 등장하고 정주사와 만나는 이야기',
      start_page: 21,
      end_page: 50,
    },
    {
      chapter_no: 3,
      title: '3장',
      content: '정주사와 초봉이의 관계가 복잡해지는 이야기',
      start_page: 51,
      end_page: 80,
    },
    {
      chapter_no: 4,
      title: '4장',
      content: '초봉이가 선택의 기로에 서는 이야기',
      start_page: 81,
      end_page: 120,
    },
  ];

  return all.filter((ch) => ch.end_page <= K);
}

function getMockCurrentChapter(K: number): string {
  if (K <= 20) {
    return '정주사는 고무신 장사로 돈을 모았다. 그는 영악하고 약삭빠른 사람이었다.';
  } else if (K <= 50) {
    return '초봉이가 처음 등장했다. 그녀는 아름답지만 가난한 처지였다. 정주사가 그녀에게 눈독을 들이기 시작했다.';
  } else if (K <= 80) {
    return '정주사와 초봉이의 관계가 점점 복잡해졌다. 초봉이는 자신의 처지를 한탄했다.';
  } else {
    return '초봉이는 큰 선택의 기로에 섰다. 정주사의 제안과 자신의 양심 사이에서 고민했다.';
  }
}

function getMockCharacters(K: number): Character[] {
  const all = [
    { id: 'char-1', book_id: 'book-1', name: '정주사', first_appearance_page: 1 },
    { id: 'char-2', book_id: 'book-1', name: '초봉', first_appearance_page: 25 },
    { id: 'char-3', book_id: 'book-1', name: '박제호', first_appearance_page: 60 },
  ];

  return all.filter((char) => char.first_appearance_page <= K);
}

function getMockRelationships(K: number): Relationship[] {
  const all = [
    {
      id: 'rel-1',
      book_id: 'book-1',
      character_a_id: 'char-1',
      character_b_id: 'char-2',
      label: '정주사 → 초봉: 탐욕',
      established_page: 30,
    },
    {
      id: 'rel-2',
      book_id: 'book-1',
      character_a_id: 'char-2',
      character_b_id: 'char-3',
      label: '초봉 → 박제호: 연민',
      established_page: 65,
    },
  ];

  return all.filter((rel) => rel.established_page <= K);
}

/**
 * Mock 벡터 검색 결과
 */
export function getMockSearchResults(query: string, K: number): SearchChunk[] {
  // 질의에 따라 다른 결과 반환
  if (query.includes('정주사')) {
    return [
      { page_no: 10, content: '정주사는 고무신 장사로 큰 돈을 벌었다.', distance: 0.15 },
      { page_no: 15, content: '정주사는 영악하고 약삭빠른 사람이었다.', distance: 0.2 },
    ].filter((chunk) => chunk.page_no <= K);
  } else if (query.includes('초봉')) {
    return [
      { page_no: 25, content: '초봉이가 처음 등장했다.', distance: 0.12 },
      { page_no: 30, content: '초봉은 아름다운 외모를 가졌지만 가난했다.', distance: 0.18 },
    ].filter((chunk) => chunk.page_no <= K);
  } else {
    // 기본 검색 결과
    return [{ page_no: 5, content: '탁류의 배경은 1930년대 군산이다.', distance: 0.25 }].filter(
      (chunk) => chunk.page_no <= K
    );
  }
}

/**
 * Mock LLM 응답 생성
 */
export async function* getMockLLMResponse(prompt: string): AsyncGenerator<string> {
  // Mock 응답 생성 (더 구체적인 것을 먼저 체크)
  let response = '';

  // 1. 가장 구체적: 관계 질문
  if (prompt.includes('관계')) {
    response =
      '정주사와 초봉의 관계는 처음에는 단순했으나 점차 복잡해집니다 (p.30-50). 정주사는 초봉에게 탐욕스러운 시선을 보내며, 초봉은 자신의 처지를 한탄합니다. 두 사람의 관계는 시간이 지날수록 더욱 복잡한 양상을 띱니다.';
  }
  // 2. K 초과 질문 (4장)
  else if (prompt.includes('4장') || prompt.includes('사장')) {
    response = '현재까지 읽은 페이지 기준으로 알 수 없는 내용입니다. 다른 질문 해주세요.';
  }
  // 3. 초봉 질문
  else if (prompt.includes('초봉')) {
    response =
      '초봉은 아름다운 외모를 가진 여성으로 p.25에 처음 등장합니다. 그녀는 가난한 처지였지만 당당한 성격을 지녔습니다 (p.30). 정주사가 그녀에게 관심을 보이기 시작합니다.';
  }
  // 4. 정주사 질문
  else if (prompt.includes('정주사')) {
    response =
      '정주사는 고무신 장사로 돈을 모은 영악한 인물입니다 (p.10). 그는 약삭빠른 성격으로 많은 재산을 축적했습니다 (p.15). 돈에 대한 집착이 강하고 계산이 빠른 사람입니다.';
  }
  // 5. 기타
  else {
    response = '현재까지 읽은 페이지 기준으로 알 수 없는 내용입니다. 다른 질문 해주세요.';
  }

  // 한 글자씩 스트리밍 (실제 LLM처럼)
  for (const char of response) {
    yield char;
    // 약간의 지연 추가 (더 실감나게)
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/**
 * Mock R2 함수들
 */
export async function mockGetCutoffSnapshot(_deviceId: string, _bookId: string) {
  return {
    current_page: 81,
    cutoff: 80,
    percent: 23.5,
    chapter: {
      chapter_no: 3,
      title: '3장',
    },
  };
}

export async function mockRecordProgressEvent(
  deviceId: string,
  bookId: string,
  event: { page: number; seq: number }
) {
  console.log('[Mock] Progress event recorded', { deviceId, bookId, event });
  return { accepted: true };
}
