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

test('FR-ADM-005: USE_MOCK=true에서 준비되지 않은 책은 403으로 실패한다', async () => {
  flags.useMock = true;

  await expect(fetchBookInfo('not-ready-book')).rejects.toMatchObject({ response: { status: 403 } });
  expect(api.get).not.toHaveBeenCalled();
});

test('USE_MOCK=true에서 없는 책은 404로 실패한다', async () => {
  flags.useMock = true;

  await expect(fetchBookInfo('no-such-book')).rejects.toMatchObject({ response: { status: 404 } });
  expect(api.get).not.toHaveBeenCalled();
});
