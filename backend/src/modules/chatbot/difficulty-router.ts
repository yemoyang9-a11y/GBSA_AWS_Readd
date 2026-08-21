/**
 * 난이도 분기 (규칙 기반)
 *
 * D13 ②: LLM 라우팅을 만들지 않는다
 *
 * 지켜야 할 조건:
 * 1. 판정이 근거 조립 범위에 관여하지 않을 것 (NFR-SEC-006 🚦)
 * 2. 선택된 모델을 질의 로그에 기록 (NFR-OBS-005 🚦)
 *
 * @see dev-spec-R3-ai.md 3장
 */

/**
 * 모델 선택 결과
 */
export interface ModelSelection {
  model: 'sonnet' | 'haiku';
  modelId: string;
  reason: string;
}

/**
 * 난이도 판정 규칙
 *
 * 이 규칙의 내용은 R3가 구현하며 정한다.
 * 문서에 명시되지 않았으므로 합리적인 규칙을 설계.
 *
 * @param query - 사용자 질의
 * @returns 모델 선택 결과
 *
 * @example
 * const selection = selectModel('초봉이가 정주사를 싫어하는 이유는?');
 * // selection = { model: 'sonnet', reason: '복잡한 동기 추론' }
 */
export function selectModel(query: string): ModelSelection {
  // 규칙 기반 판정 (예시)

  // 1. 길이 기반: 긴 질문은 복잡할 가능성
  if (query.length > 100) {
    return {
      model: 'sonnet',
      modelId: process.env.BEDROCK_CLAUDE_SONNET || '',
      reason: '긴 질문 (>100자)',
    };
  }

  // 2. 복잡성 키워드: "왜", "어떻게", "비교", "차이"
  const complexKeywords = ['왜', '어떻게', '이유', '비교', '차이', '관계', '영향'];
  const hasComplexKeyword = complexKeywords.some((kw) => query.includes(kw));

  if (hasComplexKeyword) {
    return {
      model: 'sonnet',
      modelId: process.env.BEDROCK_CLAUDE_SONNET || '',
      reason: '복잡한 추론 키워드 포함',
    };
  }

  // 3. 여러 인물 언급: 2명 이상
  // TODO: 실제로는 인물 사전으로 검증
  // 임시: 물음표가 여러 개면 복잡한 질문으로 간주
  if ((query.match(/\?/g) || []).length >= 2) {
    return {
      model: 'sonnet',
      modelId: process.env.BEDROCK_CLAUDE_SONNET || '',
      reason: '다중 질의',
    };
  }

  // 4. 기본: Haiku (쉬운 질문)
  return {
    model: 'haiku',
    modelId: process.env.BEDROCK_CLAUDE_HAIKU || '',
    reason: '단순 질의',
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
  console.log('[DifficultyRouter] Model selected', {
    timestamp: new Date().toISOString(),
    model: selection.model,
    modelId: selection.modelId,
    reason: selection.reason,
    queryLength: query.length,
    query: query.substring(0, 100), // 처음 100자만
  });
}

/**
 * 난이도 분기 통계 (모니터링용)
 */
const stats = {
  sonnet: 0,
  haiku: 0,
};

export function recordSelection(model: 'sonnet' | 'haiku'): void {
  stats[model]++;
}

export function getSelectionStats(): typeof stats {
  return { ...stats };
}

export function resetSelectionStats(): void {
  stats.sonnet = 0;
  stats.haiku = 0;
}
