/**
 * 단일 기본 모델 라우팅 (2026-08-25, 사용자 결정 — Haiku/Sonnet 분기 폐지)
 *
 * ⚠️ 회귀 방지 (2026-08-25 발견) — service.ts가 만드는 task 이름이 MODEL_CONFIG에 없으면
 * getModelForTask가 조용히 폴백 모델을 돌려준다(console.warn만 찍고 예외는 안 난다).
 * 실제로 `chatbot_${model}` → "chatbot_sonnet"이 MODEL_CONFIG의 chatbot_easy/chatbot_hard와
 * 어긋나 있어서, 라우터가 Sonnet을 골라도 전부 Haiku로 호출되고 있었다. 더 나쁜 건 질의
 * 로그(NFR-OBS-005 🚦)엔 라우터가 고른 Sonnet ID가 적혀 실제와 달랐다는 점이다.
 * 아래 첫 테스트가 그 어긋남을 이름 수준에서 고정한다.
 */

import { CHATBOT_TASK } from '../service';
import { selectModel } from '../difficulty-router';
import {
  MODEL_CONFIG,
  getModelForTask,
  DEFAULT_EFFORT,
  EFFORT_ENABLED,
} from '../../llm-gateway/model-config';

describe('task 이름 정합성 — 폴백으로 새지 않는다 (회귀)', () => {
  test('service.ts가 쓰는 챗봇 task 이름이 MODEL_CONFIG에 실제로 존재한다', () => {
    expect(Object.keys(MODEL_CONFIG)).toContain(CHATBOT_TASK);
  });

  test('챗봇 task 조회 시 "Unknown task" 폴백 경고가 나지 않는다', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation();

    getModelForTask(CHATBOT_TASK);

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  test('리캡 task도 폴백으로 새지 않는다', () => {
    expect(Object.keys(MODEL_CONFIG)).toContain('recap');
  });
});

describe('단일 기본 모델 — 질의에 따라 모델이 갈리지 않는다', () => {
  const queries = [
    '정주사가 누구야?', // 예전 규칙: Haiku
    '왜 초봉이는 그런 선택을 했나요?', // 예전 규칙: Sonnet (복잡도 키워드)
    '지금까지 읽은 내용 요약해줘', // 예전 규칙: Haiku (요약 의도)
    '언제부터 여기였나요? 나이는 몇 살인가요?', // 예전 규칙: Sonnet (다중 질의)
    '',
  ];

  test('어떤 질의를 넣어도 같은 모델 ID가 나온다', () => {
    const ids = queries.map((q) => selectModel(q).modelId);

    expect(new Set(ids).size).toBe(1);
  });

  test('선택된 모델이 챗봇 task의 실제 매핑과 일치한다 — 로그와 실제 호출이 어긋나지 않는다', () => {
    // NFR-OBS-005 🚦: 질의 로그에 적히는 모델이 실제로 호출된 모델이어야 게이트 판정이 성립한다
    queries.forEach((q) => {
      expect(selectModel(q).modelId).toBe(getModelForTask(CHATBOT_TASK));
    });
  });

  test('기본 모델은 ANTHROPIC_MODEL 설정값이다 (NFR-AI-001 — 코드 수정 없이 교체 가능)', () => {
    expect(getModelForTask(CHATBOT_TASK)).toBe(process.env.ANTHROPIC_MODEL);
    expect(getModelForTask('recap')).toBe(process.env.ANTHROPIC_MODEL);
  });
});

describe('effort 설정', () => {
  // 기본 모델은 Haiku 4.5이고, Haiku·Sonnet 4.5는 output_config.effort를 거절한다
  // ("Extra inputs are not permitted", 2026-08-25 Bedrock 확인. Anthropic API도 동일).
  // 그래서 기본은 꺼짐이며, Sonnet 5 계열로 올릴 때만 ANTHROPIC_EFFORT로 켠다.
  test('기본 effort는 꺼져 있다 — 켜져 있으면 Haiku 호출이 400으로 깨진다', () => {
    expect(DEFAULT_EFFORT).toBe('');
    expect(EFFORT_ENABLED).toBe(false);
  });
});
