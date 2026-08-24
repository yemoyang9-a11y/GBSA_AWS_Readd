/**
 * 난이도 라우팅 테스트
 *
 * 규칙 기반 모델 선택
 * 중요: 난이도 판정은 근거 범위에 영향 없음
 */

import { selectModel } from '../difficulty-router';

describe('난이도 라우팅', () => {
  describe('Sonnet 선택 (복잡한 질의)', () => {
    test('길이만 긴 질의는 더 이상 Sonnet 기준이 아님 (의도 기반으로 변경)', () => {
      // 100자를 넘지만 복잡도/요약 키워드도 다중 질문도 없는 질의 → Haiku
      const longQuery = '1234567890'.repeat(11); // 110자

      const result = selectModel(longQuery);

      expect(result.model).toBe('haiku');
    });

    test('복잡도 키워드 포함 시 Sonnet', () => {
      const queries = [
        '왜 초봉이는 그런 선택을 했나요?',
        '어떻게 그런 일이 일어났나요?',
        '두 사건의 차이를 설명해주세요',
      ];

      queries.forEach((query) => {
        const result = selectModel(query);
        expect(result.model).toBe('sonnet');
        expect(result.reason).toContain('복잡한 추론 키워드');
      });
    });

    test('다중 질문 (? 2개 이상)은 Sonnet', () => {
      // 복잡도 키워드 없는 다중 질문
      const multiQuery = '초봉이가 고향이 언제부터 여기였나요? 그리고 나이는 몇 살인가요?';

      const result = selectModel(multiQuery);

      expect(result.model).toBe('sonnet');
      expect(result.reason).toContain('다중 질의');
    });

    test('요약 의도라도 추론 키워드가 있으면 Sonnet이 우선', () => {
      const result = selectModel('지금까지 왜 이런 흐름으로 흘러갔는지 요약해줘');

      expect(result.model).toBe('sonnet');
      expect(result.reason).toContain('복잡한 추론 키워드');
    });
  });

  describe('Haiku 선택 (단순한 질의)', () => {
    test('요약·단순 조회 의도는 Haiku', () => {
      const summaryQueries = [
        '지금까지 읽은 내용 요약해줘',
        '여기까지 정리해줘',
        '간단히 알려줘',
      ];

      summaryQueries.forEach((query) => {
        const result = selectModel(query);
        expect(result.model).toBe('haiku');
        expect(result.reason).toContain('단순 조회/요약 의도');
      });
    });

    test('단순 인물/사실 조회는 Haiku', () => {
      const simpleQueries = ['초봉이가 누구인가요?', '이 장면은 어디인가요?'];

      simpleQueries.forEach((query) => {
        const result = selectModel(query);
        expect(result.model).toBe('haiku');
        expect(result.reason).toContain('단순 조회/요약 의도');
      });
    });

    test('키워드에 안 걸리는 짧은 질의는 기본값 Haiku', () => {
      const result = selectModel('정주사는 무슨 일을 하나요?');

      expect(result.model).toBe('haiku');
      expect(result.reason).toContain('단순 질의');
    });

    test('빈 문자열은 Haiku (기본값)', () => {
      const result = selectModel('');

      expect(result.model).toBe('haiku');
    });
  });

  describe('모델 ID 매핑', () => {
    test('Sonnet 선택 시 modelId 반환', () => {
      const result = selectModel('왜 그런 선택을 했나요?');

      expect(result.model).toBe('sonnet');
      expect(typeof result.modelId).toBe('string');
    });

    test('Haiku 선택 시 modelId 반환', () => {
      const result = selectModel('초봉이가 누구인가요?');

      expect(result.model).toBe('haiku');
      expect(typeof result.modelId).toBe('string');
    });
  });

  describe('근거 범위 비관여', () => {
    test('난이도 판정은 cutoff에 영향 없음 - 함수 인자 검증', () => {
      // TypeScript 타입으로 검증: selectModel(query: string)
      // cutoff나 K를 인자로 받지 않음
      const result1 = selectModel('테스트');
      const result2 = selectModel('테스트');

      // 같은 query는 항상 같은 결과 (cutoff 무관)
      expect(result1.model).toBe(result2.model);
    });

    test('같은 질의는 항상 같은 모델 선택 (결정적)', () => {
      const query = '초봉이와 정주사의 관계를 분석해주세요';

      const result1 = selectModel(query);
      const result2 = selectModel(query);

      expect(result1.model).toBe(result2.model);
      expect(result1.modelId).toBe(result2.modelId);
    });
  });
});
