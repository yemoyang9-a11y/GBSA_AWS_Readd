import { fetchBookInfo } from './bookService';
import { api } from './api';
import { mockBookInfo, mockBookInfos } from '../../mocks/fixtures';

const flags = vi.hoisted(() => ({ useMock: false }));

vi.mock('./api', () => ({ api: { get: vi.fn() } }));
vi.mock('../utils/constants', async (original) => ({
  ...(await original<typeof import('../utils/constants')>()),
  get USE_MOCK() {
    return flags.useMock;
  },
}));

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  flags.useMock = false;
});

test('USE_MOCK=false면 그 책의 /info 요청을 한 번 보낸다', async () => {
  vi.mocked(api.get).mockResolvedValue({ data: mockBookInfo });

  await expect(fetchBookInfo('done-book')).resolves.toEqual(mockBookInfo);
  expect(api.get).toHaveBeenCalledTimes(1);
  expect(vi.mocked(api.get).mock.calls[0]).toEqual(['/books/done-book/info']);
});

test('USE_MOCK=true면 네트워크 요청 없이 그 책의 fixture 정보를 준다', async () => {
  flags.useMock = true;

  await expect(fetchBookInfo('done-book')).resolves.toEqual(mockBookInfos['done-book']);
  await expect(fetchBookInfo('unread-book')).resolves.toEqual(mockBookInfos['unread-book']);
  await expect(fetchBookInfo('takryu')).resolves.toEqual(mockBookInfo);
  expect(api.get).not.toHaveBeenCalled();
});
