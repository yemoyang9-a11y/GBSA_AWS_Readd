/**
 * S6 — 페이지 임베딩 (Amazon Titan Text Embeddings V2, A8-1)
 *
 * LLM 게이트웨이(⑥)의 call()/stream()은 Claude Messages API 요청/응답 형식에 고정되어
 * 있어 Titan 임베딩(inputText → embedding 벡터)과 호환되지 않는다. 임베딩은 도서당
 * 배치 1회성 호출이라 4.3절의 "실시간 LLM 호출 게이트웨이 경유" 취지와 무관하며,
 * 재시도 유틸(withRetry)만 게이트웨이 모듈에서 재사용하고 Bedrock은 직접 호출한다.
 * (R1 스펙 3장 "[확인 필요]" 항목 — 사용자 확인 하에 이 방식으로 진행, 2026-08-20)
 */
import { InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { bedrockClient } from '../../config/aws';
import { withRetry } from '../../modules/llm-gateway/retry';

/** Amazon Titan Text Embeddings V2 고정 차원 (A8-1) */
export const EMBEDDING_DIM = 1024;

/** 페이지 원문을 Titan V2로 임베딩한다 */
export async function embedText(text: string): Promise<number[]> {
  const modelId = process.env.BEDROCK_EMBED_MODEL;
  if (!modelId) {
    throw new Error('BEDROCK_EMBED_MODEL 환경변수가 설정되지 않음');
  }

  const responseBody = await withRetry(
    async () => {
      const command = new InvokeModelCommand({
        modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify({ inputText: text }),
      });
      const response = await bedrockClient.send(command);
      return JSON.parse(new TextDecoder().decode(response.body));
    },
    { task: 'embed_page', modelId }
  );

  const embedding = responseBody.embedding;
  if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIM) {
    throw new Error(
      `Titan 임베딩 응답이 예상 차원(${EMBEDDING_DIM})과 다름: ${JSON.stringify(embedding?.length)}`
    );
  }
  return embedding;
}

/** pgvector 컬럼에 넣을 문자열 리터럴로 변환한다 (SQL에서 $n::vector로 캐스팅) */
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}
