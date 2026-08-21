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
import { getModelForTask, validateModelVersions } from './model-config';
import { withRetry } from './retry';
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
}

/**
 * LLM 스트리밍 사용량
 */
export interface LLMStreamUsage {
  inputTokens: number;
  outputTokens: number;
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

  try {
    // 모델 매핑 (D13 ②, NFR-AI-001)
    const modelId = getModelForTask(task);

    // 재시도 로직 포함 호출 (NFR-AI-003)
    const result = await withRetry(
      async () => {
        // 프롬프트 포맷 (Claude Messages API)
        const requestBody = {
          anthropic_version: 'bedrock-2023-05-31',
          max_tokens: options.maxTokens || 4096,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        };

        // Bedrock 호출
        const command = new InvokeModelCommand({
          modelId,
          contentType: 'application/json',
          accept: 'application/json',
          body: JSON.stringify(requestBody),
        });

        const response = await client.send(command);

        // 응답 파싱
        const responseBody = JSON.parse(new TextDecoder().decode(response.body));
        return responseBody;
      },
      { task, modelId }
    );

    const text = result.content[0].text;

    // 토큰 계측 (NFR-OBS-004)
    const duration = Date.now() - startTime;
    logMetrics({
      task,
      modelId,
      inputTokens: result.usage?.input_tokens || 0,
      outputTokens: result.usage?.output_tokens || 0,
      durationMs: duration,
    });

    return text;
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

  try {
    // 모델 매핑 (D13 ②, NFR-AI-001)
    const modelId = getModelForTask(task);

    const requestBody = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: options.maxTokens || 4096,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    };

    const command = new InvokeModelWithResponseStreamCommand({
      modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(requestBody),
    });

    // 재시도 로직 포함 (NFR-AI-003)
    const response = await withRetry(() => client.send(command), { task, modelId });

    if (!response.body) {
      throw new Error('No response stream');
    }

    // 스트림 파싱
    for await (const event of response.body) {
      if (event.chunk?.bytes) {
        const chunk = JSON.parse(new TextDecoder().decode(event.chunk.bytes));

        if (chunk.type === 'content_block_delta') {
          if (chunk.delta?.type === 'text_delta') {
            yield chunk.delta.text;
          }
        } else if (chunk.type === 'message_start') {
          // 입력 토큰은 message_start에 포함
          if (chunk.message?.usage?.input_tokens) {
            inputTokens = chunk.message.usage.input_tokens;
          }
        } else if (chunk.type === 'message_delta') {
          // 출력 토큰은 message_delta에 포함
          if (chunk.delta?.usage?.output_tokens) {
            outputTokens = chunk.delta.usage.output_tokens;
          }
        }
      }
    }

    // 스트리밍 완료 후 메트릭 기록 (NFR-OBS-004)
    const duration = Date.now() - startTime;
    logMetrics({
      task,
      modelId,
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
      chatbot_easy: process.env.BEDROCK_CLAUDE_HAIKU || 'not set',
      chatbot_hard: process.env.BEDROCK_CLAUDE_SONNET || 'not set',
      recap: process.env.BEDROCK_CLAUDE_HAIKU || 'not set',
    },
  };
}
