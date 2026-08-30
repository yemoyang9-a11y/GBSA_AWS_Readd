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

  // ⚠️ embed-v4의 기본 출력 차원은 1536이다. output_dimension을 명시하지 않으면
  //    1536차원이 돌아와 적재가 깨진다 — 그 파라미터가 빠지지 않았는지 고정한다.
  test('한 번에 보낼 수 있는 배치 크기가 정해져 있다 — 페이지마다 1회씩 부르지 않는다', () => {
    expect(EMBED_BATCH_SIZE).toBe(96);
  });
});
