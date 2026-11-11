import { fetchMe } from './authService';
import { api } from './api';
import { setMockMember } from '../../mocks/server';

const flags = vi.hoisted(() => ({ useMock: false }));

vi.mock('./api', () => ({ api: { get: vi.fn() }, ensureDeviceId: () => 'device' }));
vi.mock('../utils/constants', async (original) => ({
  ...(await original<typeof import('../utils/constants')>()),
  get USE_MOCK() {
    return flags.useMock;
  },
}));

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  flags.useMock = false;
  setMockMember(false);
});

test('USE_MOCK=false면 /auth/me 요청을 한 번 보낸다', async () => {
  vi.mocked(api.get).mockResolvedValue({ data: { display_name: '독자', providers: ['kakao'] } });

  await expect(fetchMe()).resolves.toEqual({ display_name: '독자', providers: ['kakao'] });
  expect(api.get).toHaveBeenCalledTimes(1);
  expect(vi.mocked(api.get).mock.calls[0]).toEqual(['/auth/me']);
});

test('USE_MOCK=true면 네트워크 요청 없이 로그인 전(401)으로 실패한다', async () => {
  flags.useMock = true;

  await expect(fetchMe()).rejects.toMatchObject({ response: { status: 401 } });
  expect(api.get).not.toHaveBeenCalled();
});

test('USE_MOCK=true에서 로그인 상태를 켜면 fixture 표시 이름을 준다', async () => {
  flags.useMock = true;
  setMockMember(true);

  await expect(fetchMe()).resolves.toEqual({ display_name: '시험 독자', providers: ['google'] });
  expect(api.get).not.toHaveBeenCalled();
});
