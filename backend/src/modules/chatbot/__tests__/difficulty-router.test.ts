/**
 * 모델 선택 테스트 (단일 기본 모델)
 *
 * ⚠️ 2026-08-25 — 난이도(Haiku/Sonnet) 분기를 폐지했다(사용자 결정). 예전 이 파일은
 *    "복잡도 키워드 → Sonnet", "요약 의도 → Haiku" 같은 분기 규칙을 고정하고 있었는데,
 *    그 규칙 자체가 사라졌으므로 기대값을 뒤집는 대신 **분기가 없다는 것**을 고정한다.
 *
 * 중요: 모델 선택은 근거 범위에 영향 없음 (NFR-SEC-006 🚦)
 */

import { selectModel, CHATBOT_TASK } from '../difficulty-router';
import { getModelForTask } from '../../llm-gateway/model-config';

describe('모델 선택 — 질의에 따라 갈리지 않는다', () => {
  // 예전 규칙에서 서로 다른 모델로 갈렸던 질의들. 이제 전부 같은 결과여야 한다.
  const previouslySonnet = [
    '왜 초봉이는 그런 선택을 했나요?', // 복잡도 키워드
    '어떻게 그런 일이 일어났나요?',
    '두 사건의 차이를 설명해주세요',
    '초봉이가 고향이 언제부터 여기였나요? 그리고 나이는 몇 살인가요?', // 다중 질의
    '지금까지 왜 이런 흐름으로 흘러갔는지 요약해줘',
  ];
  const previouslyHaiku = [
    '지금까지 읽은 내용 요약해줘', // 요약 의도
    '여기까지 정리해줘',
    '초봉이가 누구인가요?', // 단순 조회
    '정주사는 무슨 일을 하나요?', // 키워드 미해당 기본값
    '',
  ];

  test('예전에 Sonnet으로 갈리던 질의와 Haiku로 갈리던 질의가 이제 같은 모델을 쓴다', () => {
    const ids = [...previouslySonnet, ...previouslyHaiku].map((q) => selectModel(q).modelId);

    expect(new Set(ids).size).toBe(1);
  });

  test('선택 결과는 항상 단일 기본 모델을 가리킨다', () => {
    [...previouslySonnet, ...previouslyHaiku].forEach((query) => {
      const result = selectModel(query);

      expect(result.model).toBe('default');
      expect(result.reason).toBe('단일 기본 모델');
      expect(result.modelId).toBe(getModelForTask(CHATBOT_TASK));
    });
  });

  test('모델 ID는 비어 있지 않은 문자열이다', () => {
    const result = selectModel('아무 질의');

    expect(typeof result.modelId).toBe('string');
    expect(result.modelId).toBeTruthy();
  });
});

describe('근거 범위 비관여 (NFR-SEC-006 🚦)', () => {
  test('selectModel은 cutoff/K를 인자로 받지 않는다 — query 하나뿐', () => {
    expect(selectModel.length).toBe(1);
  });

  test('같은 질의는 항상 같은 결과 (결정적)', () => {
    const query = '초봉이와 정주사의 관계를 분석해주세요';

    const result1 = selectModel(query);
    const result2 = selectModel(query);

    expect(result1.model).toBe(result2.model);
    expect(result1.modelId).toBe(result2.modelId);
  });
});
