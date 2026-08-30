/**
 * 임베딩 어댑터 (Cohere embed-v4) — 적재·질의 공용 단일 지점
 *
 * A8-1 (임베딩 모델 선정) · FR-QNA-006 🚦 (벡터 검색)
 *
 * @see docs/migration.md — Phase 1 (D-1: Cohere embed-v4 / 1024차원, 2026-08-29)
 *
 * ⚠️ **적재와 질의가 반드시 같은 모델·차원·파라미터를 써야 한다.** 벡터 공간이 다르면
 *    검색은 에러 없이 조용히 무의미해진다 — 결과는 나오는데 아무 관련 없는 페이지가
 *    나온다. 로그로도 안 보인다. 그래서 예전에 embed.ts(적재)와 vector-search.ts(질의)에
 *    따로 있던 호출을 이 파일 하나로 합쳤다. 실제로 두 곳이 이미 어긋나 있었다 —
 *    적재 쪽은 모델 ID가 없으면 예외를 던졌는데 질의 쪽은 하드코딩된 기본값으로 넘어갔고,
 *    차원 검증도 적재에만 있었다.
 *
 * Titan(Bedrock 전용)에서 교체한 이유와 Cohere를 고른 근거는 migration.md D-1 참조.
 * 요지: 출력 차원을 1024로 지정할 수 있어 `vector(1024)` 스키마와 HNSW 인덱스를 그대로
 * 쓸 수 있고(데이터 이전이 UPDATE 한 줄), 한국어를 포함한 다국어 품질이 확보된다.
 */

import { withRetry } from './retry';

/**
 * 벡터 차원 — DB 스키마(`vector(1024)`)·HNSW 인덱스와 반드시 일치해야 한다.
 * (001_content_store.sql 참조)
 */
export const EMBEDDING_DIM = 1024;

/** 모델 ID — 세대를 고정한다 (NFR-AI-002와 같은 취지) */
export const EMBEDDING_MODEL = 'embed-v4.0';

/**
 * 한 번에 보낼 수 있는 텍스트 수 (Cohere v2/embed 상한 96).
 *
 * 「탁류」 411페이지면 5회 호출로 끝난다 — 체험 티어(분당 100회·월 1000회)에서도
 * 여유가 크다. 페이지마다 1회씩 부르면 411회가 되어 분당 한도에 걸린다.
 */
export const EMBED_BATCH_SIZE = 96;

/**
 * Cohere는 용도별로 input_type을 나눈다 — 같은 문장이라도 "검색당하는 문서"와
 * "검색하는 질의"의 벡터가 다르게 나온다. 이 매핑을 여기 한 곳에 두는 이유다.
 */
const INPUT_TYPE = {
  /** 색인 대상(페이지 원문)을 적재할 때 */
  document: 'search_document',
  /** 사용자 질의로 검색할 때 */
  query: 'search_query',
} as const;

const COHERE_EMBED_URL = 'https://api.cohere.com/v2/embed';

interface CohereEmbedResponse {
  embeddings?: { float?: number[][] };
}

/**
 * Cohere v2/embed 호출.
 *
 * 공식 SDK 대신 fetch를 쓴다 — 쓰는 엔드포인트가 이거 하나뿐이라 의존성을 하나 더
 * 늘릴 이유가 없다. 재시도는 게이트웨이의 withRetry를 재사용한다(fetch에는 내장 재시도가
 * 없다 — Anthropic SDK와 다른 점이다).
 */
async function callCohereEmbed(texts: string[], inputType: string): Promise<number[][]> {
  const apiKey = process.env.COHERE_API_KEY;
  if (!apiKey) {
    throw new Error('COHERE_API_KEY 환경변수가 설정되지 않음');
  }

  const body = await withRetry(
    async () => {
      const response = await fetch(COHERE_EMBED_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: EMBEDDING_MODEL,
          texts,
          input_type: inputType,
          embedding_types: ['float'],
          // ⚠️ 반드시 명시한다 — embed-v4의 기본 출력 차원은 1536이라, 빠뜨리면
          //    1536차원 벡터가 돌아와 vector(1024) 컬럼 적재가 실패한다.
          output_dimension: EMBEDDING_DIM,
        }),
      });

      if (!response.ok) {
        // withRetry가 상태 코드로 재시도 여부를 판별하도록 status를 실어 던진다
        const detail = await response.text().catch(() => '');
        const error: Error & { status?: number } = new Error(
          `Cohere embed 실패 (${response.status}): ${detail.slice(0, 200)}`
        );
        error.status = response.status;
        throw error;
      }

      return (await response.json()) as CohereEmbedResponse;
    },
    { task: 'embed', model: EMBEDDING_MODEL, inputType, count: texts.length }
  );

  const embeddings = body.embeddings?.float;
  if (!Array.isArray(embeddings) || embeddings.length !== texts.length) {
    throw new Error(
      `Cohere 임베딩 응답 개수가 요청과 다름: 요청 ${texts.length}건, 응답 ${embeddings?.length}건`
    );
  }

  // 런타임 차원 검증 — output_dimension을 빠뜨리거나 모델을 바꾸면 여기서 잡힌다.
  // 이 검증이 없으면 잘못된 차원이 DB 적재 단계까지 내려가 SQL 에러로만 드러난다.
  for (const embedding of embeddings) {
    if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIM) {
      throw new Error(
        `Cohere 임베딩 차원이 예상(${EMBEDDING_DIM})과 다름: ${embedding?.length}. ` +
          `output_dimension 파라미터와 DB 스키마 vector(${EMBEDDING_DIM})를 확인할 것.`
      );
    }
  }

  return embeddings;
}

/**
 * 색인용(적재) 임베딩 — 여러 페이지를 한 번에 보낸다.
 *
 * @param texts 페이지 원문 배열 (최대 EMBED_BATCH_SIZE)
 */
export async function embedDocuments(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  if (texts.length > EMBED_BATCH_SIZE) {
    throw new Error(
      `한 번에 보낼 수 있는 텍스트는 ${EMBED_BATCH_SIZE}건까지다 (요청 ${texts.length}건). ` +
        `호출부에서 나눠 보낼 것.`
    );
  }
  return callCohereEmbed(texts, INPUT_TYPE.document);
}

/** 색인용 임베딩 1건 — 배치가 필요 없는 호출부용 */
export async function embedDocument(text: string): Promise<number[]> {
  const [embedding] = await embedDocuments([text]);
  return embedding;
}

/**
 * 검색 질의 임베딩.
 *
 * 적재와 **다른** input_type을 쓴다 — Cohere가 질의/문서를 구분해 학습했기 때문이며,
 * 이걸 맞바꾸면 검색 품질이 조용히 떨어진다.
 */
export async function embedQuery(text: string): Promise<number[]> {
  const [embedding] = await callCohereEmbed([text], INPUT_TYPE.query);
  return embedding;
}

/** pgvector 컬럼에 넣을 문자열 리터럴로 변환한다 (SQL에서 $n::vector로 캐스팅) */
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}
