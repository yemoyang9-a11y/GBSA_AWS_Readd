/**
 * 벡터 검색 (사전 필터)
 *
 * FR-QNA-006 🚦: 검색 청크 N개 (질의 관여, 범위는 K로 강제)
 *
 * @see dev-spec-R3-ai.md 3장
 * @see architecture-r1.md 5.3절
 */

import type { SearchChunk } from '../../shared/types';

/**
 * 검색 설정
 */
const SEARCH_CONFIG = {
  topN: 6,              // 고정 (FR-QNA-006)
  embeddingDim: 1024,   // Amazon Titan Text Embeddings V2
};

/**
 * 벡터 검색 (사전 필터 필수)
 *
 * FR-QNA-006 🚦: WHERE page_no <= K (사전 필터)
 *
 * 사전 필터가 필수인 이유:
 * - 사후 필터는 결과 고갈·순위 왜곡·우회 표면을 만든다
 * - 유사도 계산 **이전**에 상한을 강제
 *
 * @param bookId - 도서 ID
 * @param query - 사용자 질의
 * @param K - 기준점 (cutoff)
 * @returns 검색된 청크 (최대 6개)
 *
 * @example
 * const results = await vectorSearch(bookId, '초봉이가 정주사를 싫어하는 이유는?', 80);
 * // results = [{ page_no: 50, content: '...', distance: 0.15 }, ...]
 */
export async function vectorSearch(
  bookId: string,
  query: string,
  K: number
): Promise<SearchChunk[]> {

  // 1. 질의 정규화 (별칭 사전으로 대표명 치환)
  const normalizedQuery = await normalizeQuery(query, bookId, K);

  // 2. 질의 임베딩
  const queryEmbedding = await embedQuery(normalizedQuery);

  // 3. 벡터 검색 - 단일 SQL (5.3절)
  // ⚠️ 사전 필터: WHERE page_no <= K
  const results = await performVectorSearch(bookId, queryEmbedding, K);

  // NFR-OBS-005 🚦: 검색 선정 페이지 번호·스코어 로깅
  logSearchResults(bookId, K, results);

  return results;
}

/**
 * 질의 정규화 (별칭 → 대표명 치환)
 *
 * 예: "정 주사" → "정주사"
 */
async function normalizeQuery(
  query: string,
  bookId: string,
  K: number
): Promise<string> {
  // TODO: 별칭 사전 조회 (K 이하)
  // SELECT alias, character_id FROM aliases
  // WHERE book_id = $1 AND first_appearance_page <= $2

  // TODO: 대표명으로 치환
  // 정 주사 → 정주사
  // 주사 → 정주사

  console.log(`[VectorSearch] Normalizing query: "${query}"`);
  return query;
}

/**
 * 질의 임베딩
 *
 * Amazon Titan Text Embeddings V2 사용
 */
async function embedQuery(query: string): Promise<number[]> {
  // TODO: Bedrock Embeddings API 호출
  // Model: amazon.titan-embed-text-v2:0
  // Output: 1024차원 벡터

  console.log(`[VectorSearch] Embedding query: "${query}"`);

  // 임시 스텁 (랜덤 벡터)
  return Array(SEARCH_CONFIG.embeddingDim).fill(0).map(() => Math.random());
}

/**
 * 벡터 검색 실행 (단일 SQL)
 *
 * FR-QNA-006 🚦: WHERE page_no <= K (사전 필터)
 *
 * pgvector의 <=> 연산자 사용 (cosine distance)
 */
async function performVectorSearch(
  bookId: string,
  queryEmbedding: number[],
  K: number
): Promise<SearchChunk[]> {
  // TODO: 실제 DB 쿼리
  /*
  SELECT
    page_no,
    content,
    embedding <=> $1::vector as distance
  FROM pages
  WHERE book_id = $2
    AND page_no <= $3    -- 사전 필터 (FR-QNA-006 🚦)
  ORDER BY distance ASC
  LIMIT 6                 -- top-N 고정
  */

  console.log(`[VectorSearch] Searching for book ${bookId}, cutoff ${K}`);

  // 임시 스텁
  return [];
}

/**
 * 검색 결과 로깅
 *
 * NFR-OBS-005 🚦: 검색 선정 페이지 번호·스코어
 *
 * 인젝션 판정 ②의 대조 대상
 */
function logSearchResults(
  bookId: string,
  K: number,
  results: SearchChunk[]
): void {
  const pages = results.map(r => r.page_no);
  const scores = results.map(r => r.distance);

  console.log('[VectorSearch] Results', {
    timestamp: new Date().toISOString(),
    bookId,
    cutoff: K,
    resultCount: results.length,
    selectedPages: pages,
    distances: scores,
  });

  // TODO: 실제 운영에서는 DB에 저장
  // INSERT INTO chatbot_query_log (search_selected_pages, ...)
}

/**
 * 검색 결과 검증 (테스트용)
 *
 * FR-QNA-006 🚦: 결과에 page_no > K인 페이지 0건
 */
export function validateSearchResults(
  results: SearchChunk[],
  K: number
): { valid: boolean; violations: number[] } {
  const violations = results
    .filter(r => r.page_no > K)
    .map(r => r.page_no);

  return {
    valid: violations.length === 0,
    violations,
  };
}

/**
 * 검색 통계 조회 (모니터링용)
 */
export function getSearchStats(): {
  config: typeof SEARCH_CONFIG;
} {
  return {
    config: SEARCH_CONFIG,
  };
}
