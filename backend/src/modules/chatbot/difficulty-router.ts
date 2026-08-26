/**
 * 모델 선택 (단일 기본 모델)
 *
 * D13 ②: LLM 라우팅을 만들지 않는다
 *
 * ⚠️ 2026-08-25 — 난이도(Haiku/Sonnet) 분기를 폐지했다(사용자 결정). 실측 결과
 *    Sonnet 5 + effort medium이 현행 Haiku와 총 지연이 거의 같으면서(7.5s vs 7.4s)
 *    첫 글자는 오히려 1초 빨라(2.5s vs 3.5s) 스트리밍 체감이 낫고 답변 품질도 좋아,
 *    질의에 따라 모델을 가를 이유가 없어졌다. 이제 어떤 질의든 같은 모델을 쓴다.
 *
 *    모듈과 로깅 경로는 남겨 둔다 — NFR-OBS-005 🚦가 "선택된 모델을 질의 로그에 기록"을
 *    요구하고, 나중에 다시 분기가 필요해지면 여기 한 곳만 되돌리면 되기 때문이다.
 *
 * 지켜야 할 조건:
 * 1. 판정이 근거 조립 범위에 관여하지 않을 것 (NFR-SEC-006 🚦) — 인자로 query만 받는다
 * 2. 선택된 모델을 질의 로그에 기록 (NFR-OBS-005 🚦)
 *
 * @see dev-spec-R3-ai.md 3장
 */

import { getModelForTask } from '../llm-gateway/model-config';

/**
 * 챗봇 LLM 호출에 쓰는 task 이름.
 *
 * ⚠️ MODEL_CONFIG의 키와 반드시 일치해야 한다 — 어긋나면 getModelForTask가 예외 없이
 *    조용히 폴백 모델로 호출한다(2026-08-25에 실제로 겪은 버그). model-routing.test.ts가
 *    이 이름을 MODEL_CONFIG 키와 대조해 고정한다.
 */
export const CHATBOT_TASK = 'chatbot';

/**
 * 모델 선택 결과
 */
export interface ModelSelection {
  /** 단일 기본 모델만 쓰므로 항상 'default'. 분기를 되살리면 여기에 갈래를 추가한다 */
  model: 'default';
  modelId: string;
  reason: string;
}

/**
 * 모델 선택
 *
 * 질의 내용과 무관하게 항상 같은 기본 모델을 돌려준다. query 인자는 남겨 둔다 —
 * 로깅 시그니처를 유지하고, 분기를 되살릴 때 호출부를 안 건드리기 위해서다.
 *
 * @param query - 사용자 질의 (선택에는 쓰이지 않는다)
 * @returns 모델 선택 결과
 */
export function selectModel(query: string): ModelSelection {
  void query; // 선택에 관여하지 않음 (NFR-SEC-006 🚦 — 근거 범위와도 무관)

  return {
    model: 'default',
    modelId: getModelForTask(CHATBOT_TASK),
    reason: '단일 기본 모델',
  };
}

/**
 * 모델 선택 로깅
 *
 * NFR-OBS-005 🚦: 선택된 모델을 질의 로그에 기록
 *
 * @param selection - 모델 선택 결과
 * @param query - 질의 (로그용)
 */
export function logModelSelection(selection: ModelSelection, query: string): void {
  console.log('[ModelRouter] Model selected', {
    timestamp: new Date().toISOString(),
    model: selection.model,
    modelId: selection.modelId,
    reason: selection.reason,
    queryLength: query.length,
    query: query.substring(0, 100), // 처음 100자만
  });
}

/**
 * 모델 선택 통계 (모니터링용)
 */
const stats = {
  default: 0,
};

export function recordSelection(model: 'default'): void {
  stats[model]++;
}

export function getSelectionStats(): typeof stats {
  return { ...stats };
}

export function resetSelectionStats(): void {
  stats.default = 0;
}
