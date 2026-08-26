/**
 * 작업별 모델 매핑 설정
 *
 * NFR-AI-001: 설정으로 분리 (코드 수정 없이 교체 가능)
 * D13 ②: 모델 배분
 *
 * @see dev-spec-R3-ai.md 2장
 */

/**
 * 단일 기본 모델 (2026-08-25, 사용자 결정 — Haiku/Sonnet 난이도 분기 폐지)
 *
 * 질의 난이도에 따라 Haiku/Sonnet으로 가르던 분기를 없애고 전 작업을 하나로 통일했다.
 * 리캡·배치도 포함한다.
 *
 * **왜 Haiku 4.5인가** — 4개 구성(Haiku 4.5 / Sonnet 4.5 / Sonnet 5 low / Sonnet 5
 * medium)을 질문 5종 × 3회, 총 60회 실측해 고른 결과다(2026-08-25).
 *   - 속도: Haiku가 전 구간 최속. 특히 요약 질문에서 11.2초로, Sonnet 5(18초대)·
 *     Sonnet 4.5(29.5초)를 크게 앞선다. 요약은 데모 필수 질문이라 이 격차가 결정적이었다.
 *   - 품질: 요약 구성력은 Sonnet 5 medium이 가장 나았고, 전제 오류 정정(FR-QNA-004
 *     회귀 케이스)은 4개 구성 모두 정답이라 차이가 없었다.
 *   - **게이트**: 근거 부재 질문에 Haiku·Sonnet 4.5는 3/3 고정 문구(46자)로 수렴한
 *     반면, Sonnet 5는 low·medium 모두 271자/194자/46자처럼 매번 다르게 답했다 —
 *     FR-QNA-004 🚦·R10("항상 같은 문구, 이유를 판별하지 않는다") 위반이다. 이것이
 *     Sonnet 5를 배제한 결정적 이유다. 쓰려면 프롬프트로 토큰 준수를 강제한 뒤
 *     재검증이 필요하다.
 *
 * ⚠️ 모델 교체는 `BEDROCK_MODEL` 환경변수로만 한다 (NFR-AI-001 — 코드 수정 없이 교체).
 *    바꾸면 NFR-AI-002에 따라 가드레일 재수행이 필요하고, 위 근거 부재 수렴성을
 *    반드시 다시 확인해야 한다.
 *
 * 폴백으로 `BEDROCK_CLAUDE_HAIKU`를 읽는다 — 기존 배포·팀원 .env에 이미 올바른 Haiku
 * 값이 들어 있어서, 그쪽을 안 고쳐도 같은 모델로 뜬다.
 */
const DEFAULT_MODEL = process.env.BEDROCK_MODEL || process.env.BEDROCK_CLAUDE_HAIKU || '';

/**
 * 기본 추론 강도 (effort) — **기본값은 꺼짐**
 *
 * ⚠️ effort를 받는 모델이 제한적이다. Sonnet 4.5·Haiku 4.5는 `output_config.effort`를
 *    "Extra inputs are not permitted"로 거절한다(2026-08-25 Bedrock 직접 확인).
 *    Sonnet 5 이상에서만 유효하다. 그래서 명시적으로 켤 때만 요청에 실린다 — 기본을
 *    'medium'으로 두면 지금 기본 모델(Haiku)에서 전 호출이 400으로 깨진다.
 */
export const DEFAULT_EFFORT = process.env.BEDROCK_EFFORT ?? '';

/**
 * effort를 요청에 실을지 여부.
 *
 * 값이 있을 때만 `output_config`를 싣는다. 지금 기본 모델(Haiku 4.5)은 이 필드를 못 받아
 * 기본은 꺼져 있고, Sonnet 5 계열로 올릴 때 `BEDROCK_EFFORT=medium`처럼 켠다.
 */
export const EFFORT_ENABLED = DEFAULT_EFFORT !== '';

/**
 * 작업 유형별 모델 매핑
 *
 * 설정으로 분리하여 테스트 결과에 따라 쉽게 변경 가능.
 * 지금은 전 작업이 단일 기본 모델을 쓰지만, 매핑 구조는 남겨 둔다 — 특정 작업만
 * 다른 모델로 돌릴 필요가 생기면 여기서 그 항목만 바꾸면 된다.
 */
export const MODEL_CONFIG = {
  // 챗봇 응답 — 난이도 분기 없이 단일 task
  chatbot: DEFAULT_MODEL,

  // 리캡 종합 (R2)
  recap: DEFAULT_MODEL,

  // 배치 생성 6종 (R1)
  generate_summary: DEFAULT_MODEL, // 장 요약
  generate_character: DEFAULT_MODEL, // 인물
  generate_relationship: DEFAULT_MODEL, // 관계
  generate_background: DEFAULT_MODEL, // 배경지식
  generate_term: DEFAULT_MODEL, // 용어
  generate_event: DEFAULT_MODEL, // 사건
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
    // ⚠️ 이 폴백은 조용하다 — 예외가 아니라 경고만 찍고 다른 모델로 호출된다. 실제로
    // 2026-08-25까지 `chatbot_sonnet`이라는 없는 이름으로 불려서 전 질의가 폴백을 타고
    // 있었고, 로그엔 라우터가 고른 모델이 적혀 실제와 어긋났다. 호출부가 만드는 task
    // 이름은 model-routing.test.ts가 MODEL_CONFIG 키와 대조해 고정한다.
    console.warn(`Unknown task: ${task}, falling back to default model`);
    return DEFAULT_MODEL;
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

  // 단일 기본 모델만 필수다 — 난이도 분기 폐지(2026-08-25)로 두 번째 모델은 없다.
  if (!DEFAULT_MODEL) {
    throw new Error('Missing required environment variable: BEDROCK_MODEL (or BEDROCK_CLAUDE_HAIKU)');
  }

  // NFR-AI-002 — 모델 버전 고정. 기동 시 실제로 무엇에 붙는지 한 줄 남겨 사후 추적이
  // 가능하게 한다. 모델이 바뀌면 가드레일 재수행 판단은 사람이 한다.
  console.log('[LLM Gateway] 기본 모델', {
    model: DEFAULT_MODEL,
    effort: DEFAULT_EFFORT || '(사용 안 함)',
  });
}
