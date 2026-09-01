/**
 * LLM 게이트웨이 (⑥)
 *
 * 모든 LLM 호출은 이 게이트웨이를 경유 (4.3절)
 * R1, R2, R3가 모두 사용
 *
 * @see architecture-r1.md 4.3절
 * @see dev-spec-R3-ai.md 1장, 2장
 * @see docs/migration.md — Phase 1 (Bedrock → Anthropic API 이관, 2026-08-29)
 *
 * ⚠️ 이 파일이 교체 지점이다 — 4.3절 의존 규칙상 모든 LLM 호출이 게이트웨이를 경유하므로,
 *    Bedrock에서 Anthropic API로 옮기면서 호출부(chatbot/service.ts, reading-state/
 *    recap.service.ts, batch/pipeline/*)는 한 줄도 건드리지 않았다. `call`/`stream`의
 *    시그니처와 반환 형태를 그대로 유지한 이유다.
 */

import Anthropic from '@anthropic-ai/sdk';
import { getModelForTask, validateModelVersions, DEFAULT_EFFORT, EFFORT_ENABLED } from './model-config';
import dotenv from 'dotenv';

// 환경 변수 로드 (gateway가 먼저 로드될 수 있으므로)
dotenv.config();

/**
 * 재시도·타임아웃 정책 (NFR-AI-003, D-2로 재정의 — 폴백 모델 없이 재시도만)
 *
 * SDK 내장 재시도를 쓴다. 직접 구현하지 않는 이유 — SDK는 408/409/429/5xx와 연결 오류를
 * Anthropic의 실제 에러 타입으로 판별해 지수 백오프로 재시도한다. 예전 retry.ts의
 * `isRetryableError`는 'ThrottlingException' 같은 **AWS 에러 이름**을 문자열 매칭했는데,
 * 그 이름들은 Anthropic SDK에서 절대 나오지 않는다 — 그대로 뒀다면 모든 오류가
 * "재시도 불가"로 분류돼 재시도가 조용히 죽었을 것이다.
 *
 * 타임아웃은 스트리밍 여부와 무관하게 넉넉히 잡는다. 리캡은 완결 장이 많이 쌓이면
 * 입력이 2만 토큰을 넘고(실측: cutoff=400에서 19,228 토큰), 챗봇 전량 주입도 8천 토큰
 * 규모라 첫 토큰까지 시간이 걸린다.
 */
const MAX_RETRIES = 3;
const TIMEOUT_MS = 120_000;

/**
 * 워크스페이스 ID (2026-08-30).
 *
 * **identity-linked API 키는 이 헤더가 없으면 400을 낸다** —
 * "anthropic-workspace-id is required when authenticating with an identity-linked
 * API key". SDK가 인증·버전·content-type 헤더는 자동으로 붙여 주지만 이건 아니다.
 *
 * 키 종류에 따라 필요 여부가 갈린다:
 *   - 워크스페이스에 묶인 일반 키 → 불필요 (키 자체가 워크스페이스를 결정한다)
 *   - identity-linked / 다중 워크스페이스 키 → **필수**
 * 그래서 값이 있을 때만 싣는다. 불필요한 키에 억지로 넣으면 그쪽이 깨진다.
 *
 * 값은 Console → Settings → Workspaces 에서 확인한다 (`wrkspc_` 로 시작).
 */
const WORKSPACE_ID = process.env.ANTHROPIC_WORKSPACE_ID?.trim();

// Anthropic 클라이언트 초기화 — 인증은 ANTHROPIC_API_KEY 환경변수 (Bedrock의 IAM 서명 대체)
const client = new Anthropic({
  maxRetries: MAX_RETRIES,
  timeout: TIMEOUT_MS, // TypeScript SDK의 timeout 단위는 밀리초다
  ...(WORKSPACE_ID ? { defaultHeaders: { 'anthropic-workspace-id': WORKSPACE_ID } } : {}),
});

// 모델 버전 검증 (NFR-AI-002)
validateModelVersions();

/**
 * LLM 호출 옵션
 */
export interface LLMCallOptions {
  maxTokens?: number;
  /**
   * 추론 강도. 생략하면 DEFAULT_EFFORT(기본은 꺼짐).
   *
   * ⚠️ Sonnet 5 이상에서만 받는다 — Haiku 4.5·Sonnet 4.5는 이 필드를 거절한다.
   */
  effort?: string;
}

/**
 * LLM 스트리밍 사용량
 */
export interface LLMStreamUsage {
  inputTokens: number;
  outputTokens: number;
}

/**
 * SDK가 받는 effort 값 — 이 다섯 개 밖은 요청 자체가 거절된다.
 */
const VALID_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
type Effort = (typeof VALID_EFFORTS)[number];

function isValidEffort(value: string): value is Effort {
  return (VALID_EFFORTS as readonly string[]).includes(value);
}

/**
 * 요청의 effort 부분.
 *
 * effort를 못 받는 모델(현재 기본값 Haiku 4.5)로 되돌릴 수 있도록 필드 자체를 빼는
 * 경로를 남긴다 — 넣은 채로 Haiku를 부르면 요청이 400으로 깨진다.
 *
 * 환경변수에서 온 문자열은 오타가 있을 수 있어 검증한다. 예전엔 그대로 실어 보내서
 * 잘못된 값이면 전 호출이 400으로 깨졌는데, 원인이 환경변수 오타라는 게 에러 메시지에
 * 드러나지 않았다. 여기서 걸러 경고를 남기고 필드를 빼는 편이 낫다 — effort는 품질
 * 조절 옵션이지 정확성에 관여하는 값이 아니라, 빠져도 응답 자체는 정상이다.
 */
function effortConfig(effort?: string): { output_config?: { effort: Effort } } {
  const resolved = effort ?? DEFAULT_EFFORT;
  if (!resolved || (effort === undefined && !EFFORT_ENABLED)) return {};

  if (!isValidEffort(resolved)) {
    console.warn(
      `[LLM Gateway] 알 수 없는 effort 값 "${resolved}" — 무시하고 요청에 싣지 않는다. ` +
        `가능한 값: ${VALID_EFFORTS.join(', ')}`
    );
    return {};
  }

  return { output_config: { effort: resolved } };
}

/**
 * 응답 content 블록에서 텍스트만 이어붙인다.
 *
 * `content`는 판별 유니온이라 `.type`으로 좁히지 않고 `.text`를 읽을 수 없다. thinking
 * 블록이 섞여 들어오는 모델로 올릴 때도 이 함수가 텍스트만 고르므로 호출부가 안 바뀐다.
 */
function extractText(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

/**
 * LLM 호출 (동기)
 *
 * @param task - 작업 유형 (예: "recap", "chatbot", "generate_summary")
 * @param prompt - LLM에 전달할 프롬프트
 * @param options - 호출 옵션 (maxTokens 등)
 * @returns LLM 응답 텍스트
 *
 * @example
 * const response = await call('recap', '줄거리를 요약해주세요...', { maxTokens: 8192 });
 */
export async function call(
  task: string,
  prompt: string,
  options: LLMCallOptions = {}
): Promise<string> {
  const startTime = Date.now();

  // 모델 매핑 (D13 ②, NFR-AI-001)
  const modelId = getModelForTask(task);

  try {
    // 재시도는 SDK가 처리한다 (NFR-AI-003) — 폴백 모델은 두지 않는다 (D-2)
    const response = await client.messages.create({
      model: modelId,
      max_tokens: options.maxTokens || 4096,
      ...effortConfig(options.effort),
      messages: [{ role: 'user', content: prompt }],
    });

    // 토큰 계측 (NFR-OBS-004)
    logMetrics({
      task,
      modelId,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      durationMs: Date.now() - startTime,
    });

    return extractText(response.content);
  } catch (error) {
    console.error('LLM Gateway Error:', { task, error });
    throw new Error(`LLM call failed for task "${task}": ${error}`);
  }
}

/**
 * LLM 스트리밍 호출
 *
 * NFR-PERF-002 🚦, NFR-PERF-008
 *
 * @param task - 작업 유형
 * @param prompt - LLM에 전달할 프롬프트
 * @param options - 호출 옵션 (maxTokens 등)
 * @yields 텍스트 청크
 * @returns 스트리밍 종료 시 토큰 사용량
 *
 * ⚠️ 반환 타입(`AsyncGenerator<string, LLMStreamUsage>`)을 Bedrock 시절 그대로 유지한다.
 *    recap.service.ts가 `gen.next()`를 수동으로 돌려 마지막 반환값(usage)을 받아
 *    NFR-OBS-002 🚦 로그에 적기 때문이다 — `for await`로는 이 값을 못 받는다.
 *
 * ⚠️ 하드 상한 도달 시 호출부가 `gen.return()`으로 스트림을 조기 취소한다
 *    (recap.service.ts의 분량 상한). Bedrock에서는 그 취소가 AWS SDK 내부 예외로
 *    번져 응답 전체를 500으로 만든 전례가 있어 호출부가 try/catch로 삼키고 있다.
 *    그 방어는 그대로 두는 게 안전하다 — Anthropic SDK에서 같은 일이 나는지는
 *    실배포에서 확인해야 한다.
 */
export async function* stream(
  task: string,
  prompt: string,
  options: LLMCallOptions = {}
): AsyncGenerator<string, LLMStreamUsage> {
  const startTime = Date.now();

  // 모델 매핑 (D13 ②, NFR-AI-001)
  const modelId = getModelForTask(task);

  try {
    // 재시도는 SDK가 처리한다 (NFR-AI-003) — 폴백 모델은 두지 않는다 (D-2)
    const messageStream = client.messages.stream({
      model: modelId,
      max_tokens: options.maxTokens || 4096,
      ...effortConfig(options.effort),
      messages: [{ role: 'user', content: prompt }],
    });

    for await (const event of messageStream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield event.delta.text;
      }
    }

    // 사용량은 완성된 메시지에서 읽는다 — message_start/message_delta 이벤트를 직접
    // 주워 담던 Bedrock 방식 대신 SDK 헬퍼를 쓴다(부분 집계 누락이 없다).
    const finalMessage = await messageStream.finalMessage();
    const usage: LLMStreamUsage = {
      inputTokens: finalMessage.usage.input_tokens,
      outputTokens: finalMessage.usage.output_tokens,
    };

    // 스트리밍 완료 후 메트릭 기록 (NFR-OBS-004)
    logMetrics({
      task,
      modelId,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      durationMs: Date.now() - startTime,
      streaming: true,
    });

    // 토큰 사용량 반환 (호출부가 로그에 기록 가능)
    return usage;
  } catch (error) {
    console.error('LLM Gateway Stream Error:', { task, error });
    throw new Error(`LLM stream failed for task "${task}": ${error}`);
  }
}

/**
 * 메트릭 로깅 (NFR-OBS-004)
 *
 * @param metrics - 기록할 메트릭
 */
interface LLMMetrics {
  task: string;
  modelId: string;
  inputTokens?: number;
  outputTokens?: number;
  durationMs: number;
  streaming?: boolean;
}

function logMetrics(metrics: LLMMetrics): void {
  console.log('[LLM Metrics]', {
    timestamp: new Date().toISOString(),
    ...metrics,
  });
}

/**
 * 게이트웨이 통계 조회 (모니터링용)
 */
export function getGatewayStats(): {
  modelConfig: Record<string, string>;
} {
  return {
    modelConfig: {
      chatbot: getModelForTask('chatbot'),
      recap: getModelForTask('recap'),
      effort: DEFAULT_EFFORT,
    },
  };
}
