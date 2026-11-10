import { toVectorLiteral, EMBEDDING_DIM, EMBEDDING_MODEL, EMBED_BATCH_SIZE } from './embed';

describe('toVectorLiteral — pgvector 리터럴 변환', () => {
  test('숫자 배열을 "[a,b,c]" 형태로 변환한다', () => {
    expect(toVectorLiteral([0.1, 0.2, 0.3])).toBe('[0.1,0.2,0.3]');
  });

  test('빈 배열은 "[]"로 변환한다', () => {
    expect(toVectorLiteral([])).toBe('[]');
  });
});

describe('EMBEDDING_DIM — A8-1 모델 확정 차원', () => {
  // 2026-08-29 (D-1): Titan(Bedrock 전용) → Cohere embed-v4. 차원 1024를 유지한 것이
  // 모델 선정의 실질 기준이었다 — vector(1024) 스키마와 HNSW 인덱스를 그대로 쓰기 위함.
  test('임베딩 차원은 1024다 — DB 스키마 vector(1024)와 일치해야 한다', () => {
    expect(EMBEDDING_DIM).toBe(1024);
  });

  test('모델은 Cohere embed-v4로 고정돼 있다 (세대 고정)', () => {
    expect(EMBEDDING_MODEL).toBe('embed-v4.0');
  });

  // 페이지마다 1회씩 부르면 411회가 되어 체험 티어 월 1,000회 한도의 41%를 한 번에 쓴다.
  //
  // 96(Cohere v2/embed 구조적 상한)이 아니라 64인 이유 — **토큰 유량 한도가 먼저 걸린다.**
  // 체험 티어는 분당 100,000 토큰이고 「탁류」는 페이지당 평균 999자(실측)라, 96건이면
  // 한 호출이 10만 토큰을 넘겨 429가 났다(2026-08-30 실제 발생). 64건은 실측 약 47,000
  // 토큰으로 한도 안에 들어온다.
  test('배치 크기가 토큰 유량 한도 안에 드는 값이다 — 페이지마다 1회씩 부르지 않는다', () => {
    expect(EMBED_BATCH_SIZE).toBe(64);
    expect(EMBED_BATCH_SIZE).toBeLessThanOrEqual(96); // Cohere v2/embed 구조적 상한
  });
});
