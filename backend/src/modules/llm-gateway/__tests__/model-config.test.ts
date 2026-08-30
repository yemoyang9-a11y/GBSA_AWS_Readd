/**
 * 모델 설정 테스트
 *
 * 작업별 모델 매핑 검증
 *
 * 2026-08-29 (Bedrock → Anthropic API 이관) — 예전 테스트는 `chatbot_easy`·`chatbot_hard`
 * 처럼 **2026-08-25에 이미 폐지된 task 이름**을 조회하면서 "문자열이면 통과"만 확인했다.
 * 그래서 존재하지 않는 task가 조용히 폴백을 타는 상황(model-routing.test.ts가 잡아낸 바로
 * 그 회귀)을 여기서는 통과시켰다. 실제 매핑 키와 ID 형식을 함께 고정하도록 고쳐 쓴다.
 */

import { getModelForTask, MODEL_CONFIG, DEFAULT_EFFORT, EFFORT_ENABLED } from '../model-config';

describe('작업별 모델 매핑', () => {
  test('실제로 쓰이는 task(chatbot·recap·배치 6종)가 전부 매핑에 있다', () => {
    const keys = Object.keys(MODEL_CONFIG);

    expect(keys).toEqual(
      expect.arrayContaining([
        'chatbot',
        'recap',
        'generate_summary',
        'generate_character',
        'generate_relationship',
        'generate_background',
        'generate_term',
        'generate_event',
      ])
    );
  });

  test('전 작업이 단일 기본 모델을 쓴다 (2026-08-25 난이도 분기 폐지)', () => {
    const ids = Object.values(MODEL_CONFIG);

    expect(new Set(ids).size).toBe(1);
  });

  test('기본 모델은 ANTHROPIC_MODEL 설정값이다 (NFR-AI-001 — 코드 수정 없이 교체 가능)', () => {
    expect(getModelForTask('recap')).toBe(process.env.ANTHROPIC_MODEL);
  });

  test('알 수 없는 작업은 경고를 남기고 기본 모델로 폴백한다', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation();

    const modelId = getModelForTask('unknown_task');

    expect(modelId).toBe(process.env.ANTHROPIC_MODEL);
    expect(warn).toHaveBeenCalled(); // 조용히 새지 않는다 — 최소한 경고는 남는다
    warn.mockRestore();
  });
});

describe('모델 ID 형식 — Anthropic API (NFR-AI-002)', () => {
  test('Bedrock 형식(리전 접두사·버전 접미사)이 남아 있지 않다', () => {
    const modelId = getModelForTask('chatbot');

    // `global.anthropic.claude-...-v1:0` 같은 Bedrock ID가 그대로 남으면 Anthropic API가
    // 모르는 모델로 400을 낸다. 이관이 덜 된 설정을 여기서 잡는다.
    expect(modelId).not.toMatch(/^(global|us|apac|eu)\./);
    expect(modelId).not.toMatch(/^anthropic\./);
    expect(modelId).not.toMatch(/-v\d+:\d+$/);
  });

  test('날짜 접미사를 붙이지 않는다 — Anthropic API의 정식 ID는 그 자체로 완결이다', () => {
    // `claude-haiku-4-5-20251001`은 존재하지 않는 ID다(Bedrock ID에서 잘못 옮겨 오기 쉽다).
    expect(getModelForTask('chatbot')).not.toMatch(/-\d{8}$/);
  });

  test('별칭(latest)을 쓰지 않는다 — 세대를 고정한다 (NFR-AI-002)', () => {
    expect(getModelForTask('chatbot')).not.toMatch(/latest/);
  });
});

describe('effort 설정', () => {
  // 기본 모델은 Haiku 4.5이고, Haiku·Sonnet 4.5는 output_config.effort를 거절한다.
  // 기본이 켜져 있으면 전 호출이 400으로 깨진다.
  test('기본 effort는 꺼져 있다 — 켜져 있으면 Haiku 호출이 깨진다', () => {
    expect(DEFAULT_EFFORT).toBe('');
    expect(EFFORT_ENABLED).toBe(false);
  });
});
