import { exchangeLoginCode, startLogin, submitConsent } from './authService';
import { api } from './api';
import { resetMockConsent } from '../../mocks/server';

const flags = vi.hoisted(() => ({ useMock: false }));

vi.mock('./api', () => ({ api: { post: vi.fn() }, ensureDeviceId: () => 'device' }));
vi.mock('../utils/constants', async (original) => ({
  ...(await original<typeof import('../utils/constants')>()),
  get USE_MOCK() {
    return flags.useMock;
  },
}));

const assign = vi.fn();

beforeEach(() => {
  vi.mocked(api.post).mockReset();
  flags.useMock = false;
  resetMockConsent();
  assign.mockReset();
  vi.stubGlobal('location', { ...window.location, assign });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test('동의 저장은 현재 약관·개인정보 버전과 만 14세 이상 확인을 보낸다', async () => {
  vi.mocked(api.post).mockResolvedValue({ status: 204 });

  await submitConsent();

  expect(api.post).toHaveBeenCalledWith('/auth/consent', {
    terms_version: '2026-11-12-draft',
    privacy_version: '2026-11-12-draft',
    age_14_confirmed: true,
  });
});

test('USE_MOCK=true면 로그인 시작이 제공자 대신 앱의 콜백 주소로 간다', () => {
  flags.useMock = true;

  startLogin('kakao');

  expect(assign).toHaveBeenCalledWith('/auth/callback#code=mock-kakao');
});

test('USE_MOCK=true면 첫 교환은 동의가 필요하고, 동의 후 교환은 필요 없다', async () => {
  flags.useMock = true;

  await expect(exchangeLoginCode('mock-kakao')).resolves.toMatchObject({ consent_required: true });
  await submitConsent();
  await expect(exchangeLoginCode('mock-kakao')).resolves.toMatchObject({ consent_required: false });
  expect(api.post).not.toHaveBeenCalled();
});
