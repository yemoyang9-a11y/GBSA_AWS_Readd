import {
  signLoginState,
  signSessionToken,
  verifyLoginState,
  verifySessionToken,
} from './session-token';

const CLAIMS = {
  userId: '22222222-2222-4222-8222-222222222222',
  readerId: '33333333-3333-4333-8333-333333333333',
};

const LOGIN_STATE = {
  provider: 'google' as const,
  deviceId: '44444444-4444-4444-8444-444444444444',
  nonce: 'nonce-value',
};

describe('session-token', () => {
  beforeEach(() => {
    process.env.AUTH_TOKEN_SECRET = 'test-only-signing-value-aaaaaaaaaaaa';
  });

  afterAll(() => {
    delete process.env.AUTH_TOKEN_SECRET;
  });

  test('서명한 토큰을 검증하면 user_id와 reader_id가 나온다', async () => {
    const token = await signSessionToken(CLAIMS);
    await expect(verifySessionToken(token)).resolves.toEqual(CLAIMS);
  });

  test('30일이 지난 토큰은 무효다', async () => {
    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    const token = await signSessionToken(CLAIMS, thirtyOneDaysAgo);
    await expect(verifySessionToken(token)).resolves.toBeNull();
  });

  test('29일이 지난 토큰은 유효하다', async () => {
    const twentyNineDaysAgo = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);
    const token = await signSessionToken(CLAIMS, twentyNineDaysAgo);
    await expect(verifySessionToken(token)).resolves.toEqual(CLAIMS);
  });

  test('다른 비밀 값으로 서명한 토큰은 무효다', async () => {
    const token = await signSessionToken(CLAIMS);
    process.env.AUTH_TOKEN_SECRET = 'another-test-only-value-bbbbbbbbbbbb';
    await expect(verifySessionToken(token)).resolves.toBeNull();
  });

  test('서명 값이 비어 있으면 토큰은 무효다', async () => {
    const token = await signSessionToken(CLAIMS);
    delete process.env.AUTH_TOKEN_SECRET;
    await expect(verifySessionToken(token)).resolves.toBeNull();
  });

  test('로그인 state는 세션 토큰으로 쓸 수 없다', async () => {
    const state = await signLoginState(LOGIN_STATE);
    await expect(verifySessionToken(state)).resolves.toBeNull();
  });

  test('세션 토큰은 로그인 state로 쓸 수 없다', async () => {
    const token = await signSessionToken(CLAIMS);
    await expect(verifyLoginState(token)).resolves.toBeNull();
  });

  test('로그인 state를 검증하면 제공자와 device_id와 난수가 나온다', async () => {
    const state = await signLoginState(LOGIN_STATE);
    await expect(verifyLoginState(state)).resolves.toEqual(LOGIN_STATE);
  });

  test('11분이 지난 로그인 state는 무효다', async () => {
    const elevenMinutesAgo = new Date(Date.now() - 11 * 60 * 1000);
    const state = await signLoginState(LOGIN_STATE, elevenMinutesAgo);
    await expect(verifyLoginState(state)).resolves.toBeNull();
  });
});
