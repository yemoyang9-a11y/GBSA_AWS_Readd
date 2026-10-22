import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { call, stream } from '../gateway';

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    responses: { create: jest.fn(), stream: jest.fn() },
  })),
}));
jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => {
    throw new Error('Unselected provider must not initialize');
  }),
}));
jest.mock('dotenv', () => ({ config: jest.fn() }));
jest.mock('../model-config', () => ({
  LLM_PROVIDER: 'openai',
  getModelForTask: () => 'test-model',
  validateModelVersions: jest.fn(),
  DEFAULT_EFFORT: 'low',
  EFFORT_ENABLED: true,
}));

describe('OpenAI gateway integration (SDK mocked, no network)', () => {
  const responses = (OpenAI as unknown as jest.Mock).mock.results[0].value.responses;
  const final = {
    id: 'resp-gateway',
    model: 'test-actual-model',
    status: 'completed',
    output_text: 'bounded answer',
    usage: {
      input_tokens: 100,
      output_tokens: 40,
      input_tokens_details: { cached_tokens: 30, cache_write_tokens: 60 },
      output_tokens_details: { reasoning_tokens: 20 },
    },
  };
  let log: jest.SpyInstance;
  let abort: jest.Mock;

  beforeEach(() => {
    responses.create.mockReset().mockResolvedValue(final);
    responses.stream.mockReset();
    abort = jest.fn();
    responses.stream.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        yield { type: 'response.output_text.delta', delta: final.output_text };
        yield { type: 'response.completed', response: final };
      },
      finalResponse: async () => final,
      abort,
    });
    log = jest.spyOn(console, 'log').mockImplementation();
  });
  afterEach(() => jest.restoreAllMocks());

  test('NFR-AI-001: initializes only the selected provider and has no vendor fallback', () => {
    expect(OpenAI).toHaveBeenCalledTimes(1);
    expect(Anthropic).not.toHaveBeenCalled();
  });

  test('call preserves its public string result, system policy, signal and default effort', async () => {
    const controller = new AbortController();
    await expect(
      call('chatbot', 'untrusted input', {
        system: 'trusted policy',
        maxTokens: 2048,
        signal: controller.signal,
      })
    ).resolves.toBe('bounded answer');
    expect(responses.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'test-model',
        instructions: 'trusted policy',
        input: [{ role: 'user', content: 'untrusted input' }],
        reasoning: { effort: 'low' },
        max_output_tokens: 2048,
        store: false,
      }),
      { signal: controller.signal }
    );
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      '[LLM Metrics]',
      expect.objectContaining({
        provider: 'openai',
        task: 'chatbot',
        modelId: 'test-actual-model',
        inputTokens: 100,
        outputTokens: 40,
        cachedInputTokens: 30,
        cacheWriteInputTokens: 60,
        reasoningTokens: 20,
      })
    );
  });

  test('stream preserves generator completion usage and explicit effort, with one metric', async () => {
    const controller = new AbortController();
    const iterator = stream('recap', 'bounded context', {
      effort: 'none',
      system: 'trusted policy',
      signal: controller.signal,
    });
    await expect(iterator.next()).resolves.toEqual({ done: false, value: 'bounded answer' });
    await expect(iterator.next()).resolves.toEqual({
      done: true,
      value: expect.objectContaining({ inputTokens: 100, outputTokens: 40 }),
    });
    expect(responses.stream).toHaveBeenCalledWith(
      expect.objectContaining({ instructions: 'trusted policy', reasoning: { effort: 'none' } }),
      { signal: controller.signal }
    );
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      '[LLM Metrics]',
      expect.objectContaining({ streaming: true, task: 'recap', modelId: 'test-actual-model' })
    );
  });

  test('FR-SPL-005: incomplete output is rejected but billed usage remains recorded once', async () => {
    responses.create.mockResolvedValue({
      ...final,
      status: 'incomplete',
      incomplete_details: { reason: 'max_output_tokens' },
    });
    await expect(call('chatbot', 'question')).rejects.toThrow('OPENAI_RESPONSE_INCOMPLETE');
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      '[LLM Metrics]',
      expect.objectContaining({ status: 'incomplete', outputTokens: 40 })
    );
    expect(Anthropic).not.toHaveBeenCalled();
  });

  test('consumer cancellation propagates through yield delegation to provider abort', async () => {
    const iterator = stream('recap', 'bounded context');
    await iterator.next();
    await iterator.return({ inputTokens: 0, outputTokens: 0 });
    expect(abort).toHaveBeenCalledTimes(1);
    expect(log).not.toHaveBeenCalled();
  });

  test('public gateway preserves AbortError for shared deadline handling', async () => {
    const controller = new AbortController();
    controller.abort();
    responses.create.mockRejectedValue(new Error('request details must not leak'));
    await expect(call('chatbot', 'question', { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
      message: 'OPENAI_ABORTED',
    });
  });
});
