/**
 * LLM 게이트웨이 (⑥)
 *
 * 모든 LLM 호출은 이 게이트웨이를 경유 (4.3절)
 * R1, R2, R3가 모두 사용
 *
 * @see architecture-r1.md 4.3절
 * @see dev-spec-R3-ai.md 1장, 2장
 */

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelWithResponseStreamCommand,
} from '@aws-sdk/client-bedrock-runtime';
import {
  getModelForTask,
  validateModelVersions,
  DEFAULT_EFFORT,
  EFFORT_ENABLED,
  FALLBACK_MODEL_ID,
  FALLBACK_ENABLED,
  getModelFamily,
} from './model-config';
import { withRetry, withFallback } from './retry';
import dotenv from 'dotenv';

// 환경 변수 로드 (gateway가 먼저 로드될 수 있으므로)
dotenv.config();

/**
 * 게이트웨이 인터페이스
 * - 8/19 오전: 최소 구현 ✅
 * - 8/19~8/20: 완성 (모델 매핑, 재시도, Rate Limit)
 */

// Bedrock 클라이언트 초기화
const client = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

// 모델 버전 검증 (NFR-AI-002)
validateModelVersions();

/**
 * LLM 호출 옵션
 */
export interface LLMCallOptions {
  maxTokens?: number;
  /**
   * 추론 강도. 생략하면 DEFAULT_EFFORT('medium').
   *
   * ⚠️ Sonnet 5 이상에서만 받는다 — Sonnet 4.5는 "Extra inputs are not permitted"로
   *    요청 자체를 거절한다(2026-08-25 Bedrock 확인).
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
 * 요청 바디의 effort 부분.
 *
 * effort를 못 받는 모델로 되돌릴 수 있도록(`BEDROCK_EFFORT=` 빈 값) 필드 자체를 빼는
 * 경로를 남긴다 — 넣은 채로 Sonnet 4.5를 부르면 "Extra inputs are not permitted"로 깨진다.
 */
function effortConfig(effort?: string): { output_config?: { effort: string } } {
  const resolved = effort ?? DEFAULT_EFFORT;
  if (!resolved || (effort === undefined && !EFFORT_ENABLED)) return {};
  return { output_config: { effort: resolved } };
}

/**
 * 모델 계열별 요청 바디 조립.
 *
 * Nova는 Claude Messages API(`anthropic_version`/`messages[].content: string`)와
 * 스키마가 다르다 — `schemaVersion`/`inferenceConfig`, content가 파트 배열이다.
 * FALLBACK_MODEL_ID 배선(model-config.ts 참고, 2026-08-26)을 위해 분기한다.
 */
function buildRequestBody(modelId: string, prompt: string, options: LLMCallOptions): object {
  if (getModelFamily(modelId) === 'nova') {
    return {
      schemaVersion: 'messages-v1',
      messages: [{ role: 'user', content: [{ text: prompt }] }],
      inferenceConfig: { maxTokens: options.maxTokens || 4096 },
    };
  }

  return {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: options.maxTokens || 4096,
    ...effortConfig(options.effort),
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  };
}

/**
 * 모델 계열별 (비스트리밍) 응답 파싱.
 */
function parseResponseBody(
  modelId: string,
  responseBody: any
): { text: string; inputTokens: number; outputTokens: number } {
  if (getModelFamily(modelId) === 'nova') {
    return {
      text: responseBody.output?.message?.content?.[0]?.text || '',
      inputTokens: responseBody.usage?.inputTokens || 0,
      outputTokens: responseBody.usage?.outputTokens || 0,
    };
  }

  return {
    text: responseBody.content[0].text,
    inputTokens: responseBody.usage?.input_tokens || 0,
    outputTokens: responseBody.usage?.output_tokens || 0,
  };
}

/**
 * 모델 계열별 스트리밍 청크 파싱.
 */
function parseStreamChunk(
  modelId: string,
  chunk: any
): { text?: string; inputTokens?: number; outputTokens?: number } {
  if (getModelFamily(modelId) === 'nova') {
    if (chunk.contentBlockDelta?.delta?.text) {
      return { text: chunk.contentBlockDelta.delta.text };
    }
    if (chunk.metadata?.usage) {
      return {
        inputTokens: chunk.metadata.usage.inputTokens,
        outputTokens: chunk.metadata.usage.outputTokens,
      };
    }
    return {};
  }

  if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
    return { text: chunk.delta.text };
  }
  if (chunk.type === 'message_start' && chunk.message?.usage?.input_tokens) {
    return { inputTokens: chunk.message.usage.input_tokens };
  }
  if (chunk.type === 'message_delta' && chunk.delta?.usage?.output_tokens) {
    return { outputTokens: chunk.delta.usage.output_tokens };
  }
  return {};
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

  // 모델별 1회 호출 (재시도 포함, NFR-AI-003) — 폴백 배선(withFallback)이 이 함수를
  // primary/fallback 모델 ID로 각각 부른다.
  const invokeModel = (modelId: string) =>
    withRetry(
      async () => {
        const requestBody = buildRequestBody(modelId, prompt, options);

        const command = new InvokeModelCommand({
          modelId,
          contentType: 'application/json',
          accept: 'application/json',
          body: JSON.stringify(requestBody),
        });

        const response = await client.send(command);
        const responseBody = JSON.parse(new TextDecoder().decode(response.body));
        return { modelId, ...parseResponseBody(modelId, responseBody) };
      },
      { task, modelId }
    );

  try {
    // 모델 매핑 (D13 ②, NFR-AI-001)
    const primaryModelId = getModelForTask(task);

    // 폴백 배선(NFR-AI-003, model-config.ts 참고) — 기본은 꺼짐, 검증 전까지 primary만 탄다
    const result = FALLBACK_ENABLED
      ? await withFallback(primaryModelId, FALLBACK_MODEL_ID, invokeModel)
      : await invokeModel(primaryModelId);

    // 토큰 계측 (NFR-OBS-004)
    const duration = Date.now() - startTime;
    logMetrics({
      task,
      modelId: result.modelId,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      durationMs: duration,
    });

    return result.text;
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
 * @example
 * const gen = stream('chatbot', '질문...', { maxTokens: 8192 });
 * for await (const chunk of gen) {
 *   console.log(chunk);
 * }
 * const usage = gen.return(await gen.next()).value; // 사용량 접근
 */
export async function* stream(
  task: string,
  prompt: string,
  options: LLMCallOptions = {}
): AsyncGenerator<string, LLMStreamUsage> {
  const startTime = Date.now();
  let inputTokens = 0;
  let outputTokens = 0;

  // 모델 하나로 스트리밍 (재시도는 연결 자체에만 적용 — NFR-AI-003)
  async function* invokeStream(modelId: string): AsyncGenerator<string> {
    const requestBody = buildRequestBody(modelId, prompt, options);

    const command = new InvokeModelWithResponseStreamCommand({
      modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(requestBody),
    });

    const response = await withRetry(() => client.send(command), { task, modelId });

    if (!response.body) {
      throw new Error('No response stream');
    }

    for await (const event of response.body) {
      if (event.chunk?.bytes) {
        const chunk = JSON.parse(new TextDecoder().decode(event.chunk.bytes));
        const delta = parseStreamChunk(modelId, chunk);

        if (delta.text) yield delta.text;
        if (delta.inputTokens) inputTokens = delta.inputTokens;
        if (delta.outputTokens) outputTokens = delta.outputTokens;
      }
    }
  }

  try {
    // 모델 매핑 (D13 ②, NFR-AI-001)
    const primaryModelId = getModelForTask(task);
    let usedModelId = primaryModelId;
    let yieldedAny = false;

    try {
      for await (const text of invokeStream(primaryModelId)) {
        yieldedAny = true;
        yield text;
      }
    } catch (error) {
      // 폴백 배선(NFR-AI-003, model-config.ts 참고) — 기본은 꺼짐, 검증 전까지 안 탄다.
      // 이미 일부 텍스트를 클라이언트로 내보낸 뒤라면 처음부터 다시 스트리밍하는 순간
      // 화면에 두 응답이 이어 붙는 꼴이 되므로, 그 경우엔 폴백하지 않고 그대로 실패시킨다.
      if (!FALLBACK_ENABLED || yieldedAny) throw error;

      console.warn('Primary model stream failed before any output, trying fallback', {
        primary: primaryModelId,
        fallback: FALLBACK_MODEL_ID,
        error,
      });
      usedModelId = FALLBACK_MODEL_ID;
      for await (const text of invokeStream(FALLBACK_MODEL_ID)) {
        yield text;
      }
    }

    // 스트리밍 완료 후 메트릭 기록 (NFR-OBS-004)
    const duration = Date.now() - startTime;
    logMetrics({
      task,
      modelId: usedModelId,
      inputTokens,
      outputTokens,
      durationMs: duration,
      streaming: true,
    });

    // 토큰 사용량 반환 (호출부가 로그에 기록 가능)
    return { inputTokens, outputTokens };
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
  // TODO: 실제 운영에서는 CloudWatch나 별도 로그 시스템으로
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
