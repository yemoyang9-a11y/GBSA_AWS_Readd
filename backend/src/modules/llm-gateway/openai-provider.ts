import type OpenAI from 'openai';
import type {
  Response,
  ResponseCreateParamsNonStreaming,
} from 'openai/resources/responses/responses';

/** Provider-side usage only; outputTokens already includes reasoningTokens. */
export interface OpenAIUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  cacheWriteInputTokens?: number;
  reasoningTokens?: number;
  modelId: string;
  responseId: string;
  status: string;
}

export interface OpenAIProviderOptions {
  /** Total generated-token ceiling, including reasoning; no hidden allowance. */
  maxTokens?: number;
  system?: string;
  /** FR-QNA-006: cutoff and budget are enforced by the caller, not the serializer. */
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  /**
   * A8-2: caller-bounded stable context, sent as the first user message before history.
   * An array marks each part's end as an explicit cache breakpoint.
   */
  context?: string | string[];
  signal?: AbortSignal;
  effort?: string;
  /** NFR-OBS-004: includes reported usage from failed/incomplete terminal responses. */
  onUsage?: (usage: OpenAIUsage) => void;
}

const VALID_EFFORTS = ['none', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
type Effort = (typeof VALID_EFFORTS)[number];

class ProviderError extends Error {}

function request(
  modelId: string,
  prompt: string,
  options: OpenAIProviderOptions
): Omit<ResponseCreateParamsNonStreaming, 'stream'> {
  const effort = options.effort;
  if (effort && !(VALID_EFFORTS as readonly string[]).includes(effort)) {
    throw new ProviderError('OPENAI_INVALID_EFFORT');
  }
  // A8-2: implicit caching writes only at the latest message end, so earlier context
  // boundaries never get a cache entry. Explicit breakpoints mark each stable part instead.
  const contextParts = Array.isArray(options.context)
    ? options.context.filter((part) => part.length > 0)
    : undefined;
  return {
    model: modelId,
    // A8-2: stable context first so the provider prefix cache can cover it across turns.
    input: [
      ...(contextParts
        ? [
            {
              role: 'user' as const,
              content: contextParts.map((text) => ({
                type: 'input_text' as const,
                text,
                prompt_cache_breakpoint: { mode: 'explicit' as const },
              })),
            },
          ]
        : typeof options.context === 'string'
          ? [{ role: 'user' as const, content: options.context }]
          : []),
      ...(options.history ?? []),
      { role: 'user', content: prompt },
    ],
    ...(contextParts ? { prompt_cache_options: { mode: 'explicit' as const, ttl: '30m' as const } } : {}),
    // FR-QNA-006: application policy cannot be promoted from question/source text.
    ...(options.system !== undefined ? { instructions: options.system } : {}),
    ...(effort ? { reasoning: { effort: effort as Effort } } : {}),
    max_output_tokens: options.maxTokens ?? 4096,
    // FR-SPL-002: each request uses only the caller's cutoff-bounded context.
    store: false,
  };
}

function usageOf(response: Response): OpenAIUsage | undefined {
  const usage = response.usage;
  if (!usage) return undefined;
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    ...(usage.input_tokens_details?.cached_tokens !== undefined
      ? { cachedInputTokens: usage.input_tokens_details.cached_tokens }
      : {}),
    ...(usage.input_tokens_details?.cache_write_tokens !== undefined
      ? { cacheWriteInputTokens: usage.input_tokens_details.cache_write_tokens }
      : {}),
    ...(usage.output_tokens_details?.reasoning_tokens !== undefined
      ? { reasoningTokens: usage.output_tokens_details.reasoning_tokens }
      : {}),
    modelId: response.model,
    responseId: response.id,
    status: response.status ?? 'unknown',
  };
}

function safeCode(code: unknown): string {
  return typeof code === 'string' && /^[a-z0-9_-]{1,80}$/i.test(code) ? code : 'unknown';
}

function completed(response: Response, requireText = true): void {
  // FR-SPL-005: partial/error output must never be mistaken for a successful answer.
  if (response.status !== 'completed') {
    const status = safeCode(response.status).toUpperCase();
    const reason = safeCode(response.error?.code ?? response.incomplete_details?.reason);
    throw new ProviderError(`OPENAI_RESPONSE_${status} code=${reason}`);
  }
  if (requireText && !response.output_text?.trim()) throw new ProviderError('OPENAI_EMPTY_OUTPUT');
}

function sanitized(error: unknown, signal?: AbortSignal): Error {
  if (error instanceof ProviderError) return error;
  const details = error && typeof error === 'object' ? (error as Record<string, unknown>) : {};
  if (signal?.aborted || details.name === 'APIUserAbortError' || details.name === 'AbortError') {
    const aborted = new Error('OPENAI_ABORTED');
    aborted.name = 'AbortError';
    return aborted;
  }
  const status = typeof details.status === 'number' ? ` status=${details.status}` : '';
  const code = details.code !== undefined ? ` code=${safeCode(details.code)}` : '';
  // SDK messages can include request details. Preserve only status/code in application errors.
  return new ProviderError(`OPENAI_REQUEST_FAILED${status}${code}`);
}

/** All callers still go through gateway.ts; this adapter owns only provider translation. */
export function createOpenAIProvider(client: Pick<OpenAI, 'responses'>) {
  return {
    async call(
      modelId: string,
      prompt: string,
      options: OpenAIProviderOptions = {}
    ): Promise<{ text: string; usage: OpenAIUsage }> {
      try {
        const response = await client.responses.create(
          request(modelId, prompt, options),
          options.signal ? { signal: options.signal } : undefined
        );
        const usage = usageOf(response);
        if (usage) options.onUsage?.(usage);
        completed(response);
        if (!usage) throw new ProviderError('OPENAI_USAGE_MISSING');
        return { text: response.output_text, usage };
      } catch (error) {
        throw sanitized(error, options.signal);
      }
    },

    async *stream(
      modelId: string,
      prompt: string,
      options: OpenAIProviderOptions = {}
    ): AsyncGenerator<string, OpenAIUsage> {
      let responseStream: ReturnType<OpenAI['responses']['stream']> | undefined;
      let usageRecorded = false;
      function recordUsage(response: Response): OpenAIUsage | undefined {
        const usage = usageOf(response);
        if (usage && !usageRecorded) {
          usageRecorded = true;
          options.onUsage?.(usage);
        }
        return usage;
      }
      try {
        responseStream = client.responses.stream(
          request(modelId, prompt, options),
          options.signal ? { signal: options.signal } : undefined
        );
        for await (const event of responseStream) {
          if (event.type === 'response.output_text.delta') yield event.delta;
          if (
            event.type === 'response.completed' ||
            event.type === 'response.failed' ||
            event.type === 'response.incomplete'
          ) {
            recordUsage(event.response);
            // output_text is an SDK helper, not guaranteed on the wire event payload.
            completed(event.response, false);
          }
          if (event.type === 'error') {
            throw new ProviderError(`OPENAI_STREAM_FAILED code=${safeCode(event.code)}`);
          }
        }
        // A clean EOF can still leave a queued/in-progress snapshot in the SDK helper.
        const response = await responseStream.finalResponse();
        const usage = recordUsage(response);
        completed(response);
        if (!usage) throw new ProviderError('OPENAI_USAGE_MISSING');
        return usage;
      } catch (error) {
        throw sanitized(error, options.signal);
      } finally {
        // Recap callers can stop at their visible-text limit via iterator.return().
        responseStream?.abort();
      }
    },
  };
}
