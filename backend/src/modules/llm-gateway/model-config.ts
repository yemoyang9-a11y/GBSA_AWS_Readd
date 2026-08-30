/**
 * 작업별 모델 매핑 설정
 *
 * NFR-AI-001: 설정으로 분리 (코드 수정 없이 교체 가능)
 * D13 ②: 모델 배분
 *
 * @see dev-spec-R3-ai.md 2장
 * @see docs/migration.md — Phase 1 (Bedrock → Anthropic API 이관, 2026-08-29)
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
 * **모델 ID 형식이 바뀌었다 (2026-08-29, Bedrock → Anthropic API)** — Bedrock은
 * `global.anthropic.claude-haiku-4-5-20251001-v1:0`처럼 리전 접두사·날짜·버전 접미사가
 * 붙은 ID를 썼지만, Anthropic API의 정식 ID는 `claude-haiku-4-5` 하나로 완결돼 있다.
 * **날짜 접미사를 붙이면 안 된다** — `claude-haiku-4-5-20251001`은 존재하지 않는 ID다.
 *
 * ⚠️ NFR-AI-002(모델 버전 고정) 재해석 — Bedrock ID에 박혀 있던 날짜가 사라졌으므로
 *    "ID 문자열에 날짜가 있으니 고정"이라는 근거는 더 이상 성립하지 않는다. 대신
 *    ① 별칭(`claude-haiku-latest` 류)을 쓰지 않고 세대 고정 ID를 쓰며,
 *    ② 기동 로그에 실제 모델을 남기고(validateModelVersions),
 *    ③ 이 값을 바꾸면 가드레일(특히 아래 근거 부재 수렴성)을 재수행한다
 *    는 세 가지로 조항의 취지를 지킨다.
 *
 * ⚠️ 모델 교체는 `ANTHROPIC_MODEL` 환경변수로만 한다 (NFR-AI-001 — 코드 수정 없이 교체).
 */
const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5';

/**
 * 기본 추론 강도 (effort) — **기본값은 꺼짐**
 *
 * ⚠️ effort를 받는 모델이 제한적이다. Haiku 4.5는 `output_config.effort`를 거절한다
 *    (Bedrock에서 "Extra inputs are not permitted"로 확인, 2026-08-25. Anthropic API도
 *    동일하게 Haiku 4.5·Sonnet 4.5에서 effort가 에러다). Sonnet 5 이상에서만 유효하다.
 *    그래서 명시적으로 켤 때만 요청에 실린다 — 기본을 'medium'으로 두면 지금 기본
 *    모델(Haiku)에서 전 호출이 깨진다.
 */
export const DEFAULT_EFFORT = process.env.ANTHROPIC_EFFORT ?? '';

/**
 * effort를 요청에 실을지 여부.
 *
 * 값이 있을 때만 `output_config`를 싣는다. 지금 기본 모델(Haiku 4.5)은 이 필드를 못 받아
 * 기본은 꺼져 있고, Sonnet 5 계열로 올릴 때 `ANTHROPIC_EFFORT=medium`처럼 켠다.
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
 * @returns Anthropic 모델 ID
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

  // 모델 ID는 코드에 기본값이 있어 비지 않는다. 실제로 없으면 부팅을 막아야 하는 건
  // API 키 쪽이다 — Bedrock은 IAM 역할로 서명해 별도 키가 없었지만, Anthropic API는
  // 키가 없으면 첫 호출에서야 401로 터진다. 조회 5종은 LLM을 안 부르므로 그때까지
  // 문제가 안 드러나고, 데모 중 챗봇을 눌러야 발견되는 실패 모드가 된다.
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('Missing required environment variable: ANTHROPIC_API_KEY');
  }

  // NFR-AI-002 — 모델 버전 고정. 기동 시 실제로 무엇에 붙는지 한 줄 남겨 사후 추적이
  // 가능하게 한다. 모델이 바뀌면 가드레일 재수행 판단은 사람이 한다.
  console.log('[LLM Gateway] 기본 모델', {
    model: DEFAULT_MODEL,
    effort: DEFAULT_EFFORT || '(사용 안 함)',
    // D-2 (2026-08-29) — 폴백 모델 없음. 단일 모델 + 재시도만(NFR-AI-003 재정의).
    // 폴백을 두면 R10/FR-QNA-004 🚦(근거 부재 시 고정 문구 수렴)을 모델별로 다시
    // 검증해야 하는데, 그 비용이 이 프로젝트 규모에 맞지 않는다. docs/migration.md D-2 참조.
    fallback: '(없음 — 재시도만, D-2)',
  });
}
