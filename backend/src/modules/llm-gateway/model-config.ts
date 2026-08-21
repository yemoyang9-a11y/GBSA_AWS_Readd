/**
 * 작업별 모델 매핑 설정
 *
 * NFR-AI-001: 설정으로 분리 (코드 수정 없이 교체 가능)
 * D13 ②: 모델 배분
 *
 * @see dev-spec-R3-ai.md 2장
 */

/**
 * 작업 유형별 모델 매핑
 *
 * 설정으로 분리하여 테스트 결과에 따라 쉽게 변경 가능
 */
export const MODEL_CONFIG = {
  // 챗봇 응답
  chatbot_easy: process.env.BEDROCK_CLAUDE_HAIKU || '', // Haiku (쉬운 질문)
  chatbot_hard: process.env.BEDROCK_CLAUDE_SONNET || '', // Sonnet (어렵고 복잡한 질문)

  // 리캡 종합 (R2)
  recap: process.env.BEDROCK_CLAUDE_HAIKU || '', // Haiku (잠정 - FR-RCP-001 🚦 미통과 시 상향)

  // 배치 생성 6종 (R1) - 미지정, 추후 결정
  generate_summary: process.env.BEDROCK_CLAUDE_HAIKU || '', // 장 요약
  generate_character: process.env.BEDROCK_CLAUDE_HAIKU || '', // 인물
  generate_relationship: process.env.BEDROCK_CLAUDE_HAIKU || '', // 관계
  generate_background: process.env.BEDROCK_CLAUDE_HAIKU || '', // 배경지식
  generate_term: process.env.BEDROCK_CLAUDE_HAIKU || '', // 용어
  generate_event: process.env.BEDROCK_CLAUDE_HAIKU || '', // 사건
} as const;

/**
 * 작업 유형에 따른 모델 선택
 *
 * @param task - 작업 유형
 * @returns Bedrock 모델 ID
 */
export function getModelForTask(task: string): string {
  const model = MODEL_CONFIG[task as keyof typeof MODEL_CONFIG];

  if (!model) {
    console.warn(`Unknown task: ${task}, falling back to Haiku`);
    return process.env.BEDROCK_CLAUDE_HAIKU || '';
  }

  return model;
}

/**
 * 모델 버전 고정 검증 (NFR-AI-002)
 *
 * 버전이 변경되면 가드레일 재수행 필요
 */
export function validateModelVersions(): void {
  // Mock 모드에서는 validation skip
  if (process.env.MOCK_MODE === 'true') {
    console.log('⚠️  Mock Mode: Skipping model version validation');
    return;
  }

  const requiredEnvVars = ['BEDROCK_CLAUDE_SONNET', 'BEDROCK_CLAUDE_HAIKU'];

  const missing = requiredEnvVars.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  // 모델 ID 버전 체크 (예: us.anthropic.claude-sonnet-4-5-20250929-v1:0)
  const sonnetId = process.env.BEDROCK_CLAUDE_SONNET!;
  const haikuId = process.env.BEDROCK_CLAUDE_HAIKU!;

  if (!sonnetId.includes('v1:0') || !haikuId.includes('v1:0')) {
    console.warn('⚠️  Model version may have changed. Review gating required (NFR-AI-002)');
  }
}
