/**
 * NFR-OBS-004: 임베딩 사용량 로그 — Cohere 응답의 meta.billed_units.input_tokens를
 * [Embed Metrics] 한 줄 JSON으로 남기는지. fetch는 목으로 막아 실제 API를 부르지 않는다.
 */
import { embedDocuments, embedQuery, EMBEDDING_DIM } from '../embedding';

const fetchMock = jest.fn();

function cohereResponse(count: number, billed?: number) {
  return {
    ok: true,
    json: async () => ({
      embeddings: { float: Array.from({ length: count }, () => new Array(EMBEDDING_DIM).fill(0)) },
      meta: billed === undefined ? {} : { billed_units: { input_tokens: billed } },
    }),
  };
}

function embedMetricsLines(spy: jest.SpyInstance): Record<string, unknown>[] {
  return spy.mock.calls
    .filter(([tag]) => tag === '[Embed Metrics]')
    .map(([, json]) => JSON.parse(json as string));
}

let logSpy: jest.SpyInstance;
const originalKey = process.env.COHERE_API_KEY;

beforeEach(() => {
  process.env.COHERE_API_KEY = 'test-key-not-real';
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  logSpy.mockRestore();
  process.env.COHERE_API_KEY = originalKey;
});

test('NFR-OBS-004: 적재 호출은 search_document · 건수 · 과금 토큰을 한 줄 JSON으로 남긴다', async () => {
  fetchMock.mockResolvedValueOnce(cohereResponse(2, 1234));
  await embedDocuments(['첫 페이지', '둘째 페이지']);

  const [line] = embedMetricsLines(logSpy);
  expect(line).toMatchObject({
    model: 'embed-v4.0',
    inputType: 'search_document',
    count: 2,
    billedInputTokens: 1234,
    waitMs: 0,
  });
  expect(typeof line.timestamp).toBe('string');
  expect(typeof line.durationMs).toBe('number');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('NFR-OBS-004: 질의 호출은 search_query로 구분되고, 사용량이 없으면 null로 남긴다', async () => {
  fetchMock.mockResolvedValueOnce(cohereResponse(1));
  await embedQuery('주인공은 누구야?');

  const [line] = embedMetricsLines(logSpy);
  expect(line).toMatchObject({ inputType: 'search_query', count: 1, billedInputTokens: null });
});
