/**
 * 벡터 검색 (사전 필터)
 *
 * FR-QNA-006 🚦: 검색 청크 N개 (질의 관여, 범위는 K로 강제)
 *
 * @see dev-spec-R3-ai.md 3장
 * @see architecture-r1.md 5.3절
 */

import type { SearchChunk } from '../../shared/types';
import * as repo from './repository';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

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
  // 별칭 사전 조회
  const aliases = await repo.findAliases(bookId, K);

  let normalizedQuery = query;

  // 별칭을 대표명으로 치환 (긴 것부터 먼저)
  aliases.sort((a, b) => b.alias.length - a.alias.length);

  for (const { alias, characterName } of aliases) {
    normalizedQuery = normalizedQuery.replace(new RegExp(alias, 'g'), characterName);
  }

  console.log(`[VectorSearch] Normalized: "${query}" → "${normalizedQuery}"`);
  return normalizedQuery;
}

/**
 * 질의 임베딩
 *
 * Amazon Titan Text Embeddings V2 사용
 */
async function embedQuery(query: string): Promise<number[]> {
  const client = new BedrockRuntimeClient({
    region: process.env.AWS_REGION || 'us-east-1',
  });

  const modelId = process.env.BEDROCK_EMBED_MODEL || 'amazon.titan-embed-text-v2:0';

  const requestBody = {
    inputText: query,
  };

  const command = new InvokeModelCommand({
    modelId,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify(requestBody),
  });

  const response = await client.send(command);
  const responseBody = JSON.parse(new TextDecoder().decode(response.body));

  // Titan 응답 형식: { embedding: [number[], ...] }
  const embedding = responseBody.embedding || responseBody.embeddings?.[0];

  if (!embedding) {
    throw new Error('Failed to get embedding from Titan');
  }

  console.log(`[VectorSearch] Embedded query: "${query}" (${embedding.length}D)`);
  return embedding;
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
  return repo.vectorSearch(bookId, queryEmbedding, K, SEARCH_CONFIG.topN);
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
