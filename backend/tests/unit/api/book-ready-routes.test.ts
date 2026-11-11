const mockState = {
  findReadiness: jest.fn(),
  getPage: jest.fn(),
  acceptProgressEvent: jest.fn(),
  touchActivity: jest.fn(),
  acceptHeartbeat: jest.fn(),
  getCutoffSnapshot: jest.fn(),
  getBriefing: jest.fn(),
  getRecap: jest.fn(),
  handleQuery: jest.fn(),
  resolveConversation: jest.fn(),
  checkRateLimit: jest.fn(),
};

jest.mock('../../../src/config/database', () => ({ pool: {} }));
jest.mock('../../../src/modules/reading-state/composition', () => ({
  createReadingStateServices: () => ({
    progressService: { acceptProgressEvent: mockState.acceptProgressEvent },
    sessionService: {
      touchActivity: mockState.touchActivity,
      acceptHeartbeat: mockState.acceptHeartbeat,
    },
    cutoffService: { getCutoffSnapshot: mockState.getCutoffSnapshot },
    briefingService: { getBriefing: mockState.getBriefing },
    recapService: { getRecap: mockState.getRecap },
  }),
}));
jest.mock('../../../src/modules/content/composition', () => ({
  createContentServices: () => ({
    content: { findReadiness: mockState.findReadiness },
    pageService: { getPage: mockState.getPage },
  }),
}));
jest.mock('../../../src/modules/ssabi/composition', () => ({
  createSsabiServices: () => ({}),
}));
jest.mock('../../../src/modules/chatbot/conversation-service', () => ({
  resolveConversation: (...args: unknown[]) => mockState.resolveConversation(...args),
  listConversations: jest.fn(),
  getConversationDetail: jest.fn(),
  deleteConversation: jest.fn(),
  parseConversationId: () => undefined,
}));
jest.mock('../../../src/modules/chatbot/service', () => ({
  handleQuery: (...args: unknown[]) => mockState.handleQuery(...args),
}));
jest.mock('../../../src/modules/llm-gateway/rate-limiter', () => ({
  checkRateLimit: (...args: unknown[]) => mockState.checkRateLimit(...args),
}));

const SNAPSHOT = { current_page: 40, cutoff: 40, percent: 0.4, is_complete: false, chapter: 2 };

type Method = 'get' | 'post';
interface RouteCase {
  name: string;
  method: Method;
  path: string;
  body?: Record<string, unknown>;
  okExpect: (res: ReturnType<typeof makeResponse>) => void;
}

function makeResponse() {
  const response: Record<string, jest.Mock> = {
    status: jest.fn(),
    json: jest.fn(),
    setHeader: jest.fn(),
    flushHeaders: jest.fn(),
    write: jest.fn(),
    end: jest.fn(),
    send: jest.fn(),
  };
  response.status.mockReturnValue(response);
  response.json.mockReturnValue(response);
  return response;
}

const CASES: RouteCase[] = [
  {
    name: 'POST /books/:bookId/chat',
    method: 'post',
    path: '/books/:bookId/chat',
    body: { query: '질문' },
    okExpect: (res) => {
      expect(mockState.handleQuery).toHaveBeenCalledTimes(1);
      expect(res.write).toHaveBeenCalledWith(expect.stringContaining('"type":"delta"'));
    },
  },
  {
    name: 'POST /books/:bookId/progress',
    method: 'post',
    path: '/books/:bookId/progress',
    body: { page: 40, seq: 1 },
    okExpect: (res) => {
      expect(mockState.acceptProgressEvent).toHaveBeenCalledTimes(1);
      expect(res.json).toHaveBeenCalledWith({ success: true, applied_cutoff: 40 });
    },
  },
  {
    name: 'POST /books/:bookId/heartbeat',
    method: 'post',
    path: '/books/:bookId/heartbeat',
    body: {},
    okExpect: (res) => {
      expect(mockState.acceptHeartbeat).toHaveBeenCalledTimes(1);
      expect(res.json).toHaveBeenCalledWith({ success: true });
    },
  },
  {
    name: 'GET /books/:bookId/briefing',
    method: 'get',
    path: '/books/:bookId/briefing',
    okExpect: (res) => {
      expect(mockState.getBriefing).toHaveBeenCalledTimes(1);
      expect(res.json).toHaveBeenCalledWith({ briefing: true });
    },
  },
  {
    name: 'POST /books/:bookId/recap/stream',
    method: 'post',
    path: '/books/:bookId/recap/stream',
    body: { page: 40, seq: 1 },
    okExpect: (res) => {
      expect(mockState.getRecap).toHaveBeenCalledTimes(1);
      expect(res.write).toHaveBeenCalledWith(expect.stringContaining('"type":"done"'));
    },
  },
];

function loadRouter(mockMode: boolean) {
  process.env.MOCK_MODE = mockMode ? 'true' : 'false';
  let router: any;
  jest.isolateModules(() => {
    router = require('../../../src/api/routes').default;
  });
  return router;
}

async function call(router: any, c: RouteCase) {
  const route = router.stack.find(
    (layer: any) => layer.route?.path === c.path && layer.route.methods[c.method]
  ).route;
  const response = makeResponse();
  await route.stack[0].handle(
    {
      params: { bookId: 'book' },
      headers: { 'x-device-id': 'reader' },
      query: {},
      body: c.body ?? {},
    },
    response
  );
  return response;
}

function expectNothingTouched() {
  expect(mockState.checkRateLimit).not.toHaveBeenCalled();
  expect(mockState.acceptProgressEvent).not.toHaveBeenCalled();
  expect(mockState.touchActivity).not.toHaveBeenCalled();
  expect(mockState.acceptHeartbeat).not.toHaveBeenCalled();
  expect(mockState.getCutoffSnapshot).not.toHaveBeenCalled();
  expect(mockState.getBriefing).not.toHaveBeenCalled();
  expect(mockState.getRecap).not.toHaveBeenCalled();
  expect(mockState.getPage).not.toHaveBeenCalled();
  expect(mockState.resolveConversation).not.toHaveBeenCalled();
  expect(mockState.handleQuery).not.toHaveBeenCalled();
}

const originalMockMode = process.env.MOCK_MODE;

beforeEach(() => {
  jest.resetAllMocks();
  mockState.findReadiness.mockResolvedValue(true);
  mockState.checkRateLimit.mockReturnValue({ allowed: true });
  mockState.getCutoffSnapshot.mockResolvedValue(SNAPSHOT);
  mockState.getBriefing.mockResolvedValue({ briefing: true });
  mockState.getPage.mockResolvedValue({ page_no: 40, content: '본문' });
  mockState.resolveConversation.mockResolvedValue({ conversationId: 1 });
  mockState.getRecap.mockResolvedValue({ kind: 'reused', text: '리캡' });
  mockState.handleQuery.mockImplementation(async function* () {
    yield '답';
  });
});

afterAll(() => {
  if (originalMockMode === undefined) delete process.env.MOCK_MODE;
  else process.env.MOCK_MODE = originalMockMode;
});

describe.each(CASES)('$name', (c) => {
  test('FR-BRW-002: 미완비 도서는 403 BOOK_NOT_READY이고 챗봇·리캡·진도·세션 저장소를 호출하지 않는다', async () => {
    mockState.findReadiness.mockResolvedValue(false);

    const res = await call(loadRouter(false), c);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'BOOK_NOT_READY' }));
    expect(res.setHeader).not.toHaveBeenCalled();
    expect(res.write).not.toHaveBeenCalled();
    expectNothingTouched();
  });

  test('FR-BRW-002: 완비 도서는 기존과 같은 정상 응답을 준다', async () => {
    const res = await call(loadRouter(false), c);

    expect(res.status).not.toHaveBeenCalled();
    c.okExpect(res);
  });

  test('FR-BRW-002: 없는 도서는 404 NOT_FOUND이고 아무 저장소도 호출하지 않는다', async () => {
    mockState.findReadiness.mockResolvedValue(null);

    const res = await call(loadRouter(false), c);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'NOT_FOUND' }));
    expectNothingTouched();
  });
});

describe('MOCK_MODE', () => {
  test('FR-BRW-002: MOCK_MODE 챗봇 경로에서도 미완비 도서는 403이고 챗봇을 호출하지 않는다', async () => {
    mockState.findReadiness.mockResolvedValue(false);

    const res = await call(loadRouter(true), CASES[0]);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockState.handleQuery).not.toHaveBeenCalled();
    expect(mockState.checkRateLimit).not.toHaveBeenCalled();
  });
});
