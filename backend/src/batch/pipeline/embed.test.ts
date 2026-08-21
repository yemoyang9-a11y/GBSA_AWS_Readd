import { toVectorLiteral, EMBEDDING_DIM } from './embed';

describe('toVectorLiteral — pgvector 리터럴 변환', () => {
  test('숫자 배열을 "[a,b,c]" 형태로 변환한다', () => {
    expect(toVectorLiteral([0.1, 0.2, 0.3])).toBe('[0.1,0.2,0.3]');
  });

  test('빈 배열은 "[]"로 변환한다', () => {
    expect(toVectorLiteral([])).toBe('[]');
  });
});

describe('EMBEDDING_DIM — A8-1 모델 확정 차원', () => {
  test('Amazon Titan Text Embeddings V2는 1024차원이다', () => {
    expect(EMBEDDING_DIM).toBe(1024);
  });
});
