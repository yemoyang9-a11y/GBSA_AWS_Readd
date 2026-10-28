import { handleQuery } from '../service';
import { assembleContext } from '../context-assembly';
import { vectorSearch } from '../vector-search';
import { stream, call } from '../../llm-gateway/gateway';
import { getConversationContext, recordTurns } from '../conversation-service';

jest.mock('../context-assembly', () => ({
  assembleContext: jest.fn(),
  buildStableContext: () => 'bounded p.40 evidence',
  buildStableContextParts: () => ['bounded p.40 evidence', ''],
}));
jest.mock('../vector-search', () => ({ vectorSearch: jest.fn() }));
jest.mock('../../llm-gateway/gateway', () => ({ stream: jest.fn(), call: jest.fn() }));
jest.mock('../conversation-service', () => ({
  getConversationContext: jest.fn(),
  recordTurns: jest.fn(),
}));

describe('single generation with immediate chatbot streaming', () => {
  const ask = () => handleQuery('book', '이 장면을 설명해줘', 40, 'device', 7);
  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
    (assembleContext as jest.Mock).mockResolvedValue({
      chapter_summaries: [],
      background: '',
      entities: { characters: [], relationships: [], character_notes: [], terms: [], events: [] },
    });
    (vectorSearch as jest.Mock).mockResolvedValue([]);
    (getConversationContext as jest.Mock).mockResolvedValue([]);
  });
  afterEach(() => jest.restoreAllMocks());

  test('emits first chunk before the provider finishes, then stores one complete answer', async () => {
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let providerFinished = false;
    (stream as jest.Mock).mockImplementation(async function* () {
      yield '먼저 나온 문장. ';
      await gate;
      providerFinished = true;
      yield '다음 문장.';
    });
    const iterator = ask();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const first = await Promise.race([
        iterator.next(),
        new Promise((resolve) => {
          timeout = setTimeout(() => resolve('buffered-until-complete'), 500);
        }),
      ]);
      expect(first).toEqual({ done: false, value: '먼저 나온 문장. ' });
      expect(providerFinished).toBe(false);
      expect(recordTurns).not.toHaveBeenCalled();
      finish();
      await expect(iterator.next()).resolves.toEqual({ done: false, value: '다음 문장.' });
      await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined });
      expect(recordTurns).toHaveBeenCalledWith(
        7,
        '이 장면을 설명해줘',
        '먼저 나온 문장. 다음 문장.',
        40
      );
      expect(stream).toHaveBeenCalledTimes(1);
      expect(call).not.toHaveBeenCalled();
      const queryLog = (console.log as jest.Mock).mock.calls.find(
        ([label]) => label === '[Chatbot] Query log'
      );
      expect(queryLog).toBeDefined();
      expect(JSON.parse(queryLog![1])).toEqual(expect.objectContaining({ logical_model_calls: 1 }));
    } finally {
      if (timeout) clearTimeout(timeout);
      finish();
      await iterator.return(undefined).catch(() => {});
    }
  });

  test('provider failure after a visible prefix propagates without saving or regenerating', async () => {
    (stream as jest.Mock).mockImplementation(async function* () {
      yield '첫 문장.';
      throw new Error('provider failed');
    });
    const iterator = ask();
    await expect(iterator.next()).resolves.toEqual({ done: false, value: '첫 문장.' });
    await expect(iterator.next()).rejects.toThrow('provider failed');
    expect(recordTurns).not.toHaveBeenCalled();
    expect(stream).toHaveBeenCalledTimes(1);
    expect(call).not.toHaveBeenCalled();
  });

  test('empty output is an error, with no second model call or saved answer', async () => {
    (stream as jest.Mock).mockImplementation(async function* () {});
    await expect(ask().next()).rejects.toThrow('CHATBOT_EMPTY_RESPONSE');
    expect(stream).toHaveBeenCalledTimes(1);
    expect(call).not.toHaveBeenCalled();
    expect(recordTurns).not.toHaveBeenCalled();
  });

  test('consumer cancellation closes the provider and does not save the partial answer', async () => {
    let closed = false;
    (stream as jest.Mock).mockImplementation(async function* () {
      try {
        yield '첫 문장.';
        yield '다음 문장.';
      } finally {
        closed = true;
      }
    });
    const iterator = ask();
    await iterator.next();
    await iterator.return(undefined);
    expect(closed).toBe(true);
    expect((stream as jest.Mock).mock.calls[0][2].signal.aborted).toBe(true);
    expect(recordTurns).not.toHaveBeenCalled();
  });

  test('60-second generation deadline aborts a stalled stream after its already emitted prefix', async () => {
    jest.useFakeTimers();
    try {
      (stream as jest.Mock).mockImplementation(async function* (_task, _prompt, options) {
        yield '첫 문장.';
        await new Promise((_resolve, reject) =>
          options.signal.addEventListener('abort', () => reject(new Error('request aborted')), {
            once: true,
          })
        );
      });
      const iterator = ask();
      await expect(iterator.next()).resolves.toEqual({ done: false, value: '첫 문장.' });
      const done = expect(iterator.next()).rejects.toThrow('request aborted');
      await jest.advanceTimersByTimeAsync(60_000);
      await done;
      expect(recordTurns).not.toHaveBeenCalled();
      expect(stream).toHaveBeenCalledTimes(1);
      expect(call).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});
