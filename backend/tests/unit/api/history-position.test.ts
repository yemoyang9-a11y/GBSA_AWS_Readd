import router from '../../../src/api/routes';
import { createReadingStateServices } from '../../../src/modules/reading-state/composition';
import {
  listConversations,
  getConversationDetail,
} from '../../../src/modules/chatbot/conversation-service';

jest.mock('../../../src/config/database', () => ({ pool: {} }));
jest.mock('../../../src/modules/reading-state/composition', () => ({
  createReadingStateServices: jest.fn(() => ({ cutoffService: { getCutoffSnapshot: jest.fn() } })),
}));
jest.mock('../../../src/modules/content/composition', () => ({
  createContentServices: jest.fn(() => ({})),
}));
jest.mock('../../../src/modules/ssabi/composition', () => ({
  createSsabiServices: jest.fn(() => ({})),
}));
jest.mock('../../../src/modules/chatbot/conversation-service');
jest.mock('../../../src/modules/chatbot/service', () => ({ handleQuery: jest.fn() }));
jest.mock('../../../src/modules/llm-gateway/rate-limiter', () => ({ checkRateLimit: jest.fn() }));

const snapshot = (createReadingStateServices as jest.Mock).mock.results[0].value.cutoffService
  .getCutoffSnapshot;

async function request(detail: boolean, expectedPage?: unknown) {
  const path = '/books/:bookId/chat/conversations' + (detail ? '/:conversationId' : '');
  const route = (router as any).stack.find(
    (layer: any) => layer.route?.path === path && layer.route.methods.get
  ).route;
  const response = { status: jest.fn(), json: jest.fn() };
  response.status.mockReturnValue(response);
  response.json.mockReturnValue(response);
  await route.stack[0].handle(
    {
      params: { bookId: 'book', conversationId: '7' },
      headers: { 'x-device-id': 'reader' },
      query: expectedPage === undefined ? {} : { expected_page: expectedPage },
    },
    response
  );
  return response;
}

beforeEach(() => {
  jest.clearAllMocks();
  snapshot.mockResolvedValue({ current_page: 90, cutoff: 90 });
  (listConversations as jest.Mock).mockResolvedValue([{ title: 'future title' }]);
  (getConversationDetail as jest.Mock).mockResolvedValue({ turns: [{ text: 'future answer' }] });
});

describe.each([false, true])('history position guard, detail=%s', (detail) => {
  test('fresh request after rewind cannot reuse a higher server position', async () => {
    const response = await request(detail, '40');
    expect(response.status).toHaveBeenCalledWith(409);
    expect(listConversations).not.toHaveBeenCalled();
    expect(getConversationDetail).not.toHaveBeenCalled();
    expect(JSON.stringify(response.json.mock.calls)).not.toContain('future');
  });
  test('matching page uses the server snapshot cutoff, even when it is zero', async () => {
    snapshot.mockResolvedValue({ current_page: 1, cutoff: 0 });
    await request(detail, '1');
    if (detail) expect(getConversationDetail).toHaveBeenCalledWith('reader', 'book', 7, 0);
    else expect(listConversations).toHaveBeenCalledWith('reader', 'book', 0);
  });
  test('invalid expected position is rejected before content is queried', async () => {
    const response = await request(detail, ['40', '90']);
    expect(response.status).toHaveBeenCalledWith(400);
    expect(listConversations).not.toHaveBeenCalled();
    expect(getConversationDetail).not.toHaveBeenCalled();
  });
  test('legacy clients still receive only the authoritative server cutoff', async () => {
    await request(detail);
    if (detail) expect(getConversationDetail).toHaveBeenCalledWith('reader', 'book', 7, 90);
    else expect(listConversations).toHaveBeenCalledWith('reader', 'book', 90);
  });
});
