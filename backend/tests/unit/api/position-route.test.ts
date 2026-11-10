import router from '../../../src/api/routes';
import { createReadingStateServices } from '../../../src/modules/reading-state/composition';
import { createContentServices } from '../../../src/modules/content/composition';

jest.mock('../../../src/config/database', () => ({ pool: {} }));
jest.mock('../../../src/modules/reading-state/composition', () => ({
  createReadingStateServices: jest.fn(() => ({ cutoffService: { getReadChapters: jest.fn() } })),
}));
jest.mock('../../../src/modules/content/composition', () => ({
  createContentServices: jest.fn(() => ({ content: { findReadiness: jest.fn() } })),
}));
jest.mock('../../../src/modules/ssabi/composition', () => ({
  createSsabiServices: jest.fn(() => ({})),
}));
jest.mock('../../../src/modules/chatbot/conversation-service');
jest.mock('../../../src/modules/chatbot/service', () => ({ handleQuery: jest.fn() }));
jest.mock('../../../src/modules/llm-gateway/rate-limiter', () => ({ checkRateLimit: jest.fn() }));

const getReadChapters = (createReadingStateServices as jest.Mock).mock.results[0].value
  .cutoffService.getReadChapters;
const findReadiness = (createContentServices as jest.Mock).mock.results[0].value.content
  .findReadiness;

const POSITION = {
  applied_cutoff: 40,
  current_chapter_no: 2,
  read_chapter_nos: [1, 2],
  is_complete: false,
};

async function request(overrides: Record<string, unknown> = {}) {
  const route = (router as any).stack.find(
    (layer: any) => layer.route?.path === '/books/:bookId/position' && layer.route.methods.get
  ).route;
  const response = { status: jest.fn(), json: jest.fn(), setHeader: jest.fn() };
  response.status.mockReturnValue(response);
  response.json.mockReturnValue(response);
  await route.stack[0].handle(
    { params: { bookId: 'book' }, headers: { 'x-device-id': 'reader' }, query: {}, ...overrides },
    response
  );
  return response;
}

beforeEach(() => {
  jest.clearAllMocks();
  findReadiness.mockResolvedValue(true);
  getReadChapters.mockResolvedValue(POSITION);
});

describe('GET /books/:bookId/position', () => {
  test('FR-SPL-002: 준비된 책은 서버 스냅샷으로 만든 응답을 그대로 준다', async () => {
    const response = await request();

    expect(getReadChapters).toHaveBeenCalledWith('reader', 'book');
    expect(response.json).toHaveBeenCalledWith(POSITION);
    expect(response.status).not.toHaveBeenCalled();
  });

  test('절대 규칙 8: 요청의 쪽 번호·기준점은 조회에 관여하지 않는다', async () => {
    await request({ query: { page: '200', cutoff: '200' }, body: { cutoff: 200 } });

    expect(getReadChapters).toHaveBeenCalledTimes(1);
    expect(getReadChapters).toHaveBeenCalledWith('reader', 'book');
  });

  test('FR-BRW-002: 준비되지 않은 책은 403이고 진도를 조회하지 않는다', async () => {
    findReadiness.mockResolvedValue(false);

    const response = await request();

    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'BOOK_NOT_READY' })
    );
    expect(getReadChapters).not.toHaveBeenCalled();
  });

  test('X-Device-Id가 없으면 400이고 진도를 조회하지 않는다', async () => {
    const response = await request({ headers: {} });

    expect(response.status).toHaveBeenCalledWith(400);
    expect(getReadChapters).not.toHaveBeenCalled();
  });

  test('FR-SPL-005: 조회가 실패하면 500이고 읽은 장을 내보내지 않는다', async () => {
    getReadChapters.mockRejectedValue(new Error('failed'));

    const response = await request();

    expect(response.status).toHaveBeenCalledWith(500);
    expect(JSON.stringify(response.json.mock.calls)).not.toContain('read_chapter_nos');
  });

  test('FR-SPL-002: 진도에 따라 달라지는 응답은 캐시되지 않는다', async () => {
    const response = await request();

    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
  });
});
