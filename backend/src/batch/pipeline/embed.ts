/**
 * S6 — 페이지 임베딩 (Cohere embed-v4, A8-1)
 *
 * LLM 게이트웨이(⑥)의 call()/stream()은 Claude Messages API 요청/응답 형식에 고정되어
 * 있어 임베딩(텍스트 → 벡터)과 호환되지 않는다. 임베딩은 도서당 배치 1회성 호출이라
 * 4.3절의 "실시간 LLM 호출 게이트웨이 경유" 취지와 무관하다.
 * (R1 스펙 3장 "[확인 필요]" 항목 — 사용자 확인 하에 이 방식으로 진행, 2026-08-20)
 *
 * 2026-08-29 (Bedrock → Anthropic API 이관, D-1) — Titan은 Bedrock 전용이라 AWS를 닫으면
 * 못 쓴다. Cohere embed-v4(출력 차원 1024 명시)로 교체했다. 실제 호출은
 * `modules/llm-gateway/embedding.ts`가 적재·질의 공용으로 담당한다 — 두 경로가 다른
 * 모델·차원을 쓰면 검색이 조용히 무의미해지기 때문이다. 이 파일은 그 얇은 재수출로 남긴다.
 */
export {
  EMBEDDING_DIM,
  EMBEDDING_MODEL,
  EMBED_BATCH_SIZE,
  embedDocuments,
  toVectorLiteral,
} from '../../modules/llm-gateway/embedding';

import { embedDocument } from '../../modules/llm-gateway/embedding';

/**
 * 페이지 원문 1건을 임베딩한다.
 *
 * ⚠️ 호출부가 페이지마다 이 함수를 부르면 411회 호출이 되어 Cohere 체험 티어의 분당
 *    한도(100회)에 걸린다. 여러 페이지를 적재할 때는 `embedDocuments`로 묶어 보낼 것
 *    (한 번에 최대 EMBED_BATCH_SIZE건 — 「탁류」 전권이 5회로 끝난다).
 */
export async function embedText(text: string): Promise<number[]> {
  return embedDocument(text);
}
