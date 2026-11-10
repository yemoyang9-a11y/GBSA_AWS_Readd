import { fetchChatConversations, fetchChatConversationDetail } from './chatbotService';
import { api } from './api';

vi.mock('./api', () => ({ api: { get: vi.fn(async () => ({ data: [] })) } }));
vi.mock('../utils/constants', () => ({ USE_MOCK: false, API_BASE_URL: '/api' }));

it('sends the expected server position for history lists and details', async () => {
  await fetchChatConversations('book', 40);
  expect(api.get).toHaveBeenLastCalledWith('/books/book/chat/conversations', {
    params: { expected_page: 40 },
  });
  await fetchChatConversationDetail('book', 3, 40);
  expect(api.get).toHaveBeenLastCalledWith('/books/book/chat/conversations/3', {
    params: { expected_page: 40 },
  });
});
