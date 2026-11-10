import { oauthProviders } from './oauth-providers';

const REDIRECT_URI = 'https://api.test/auth/callback';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('oauth-providers', () => {
  const originalEnv = { ...process.env };
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = 'google-id';
    process.env.GOOGLE_CLIENT_SECRET = 'google-value';
    process.env.KAKAO_CLIENT_ID = 'kakao-id';
    process.env.KAKAO_CLIENT_SECRET = 'kakao-value';
    fetchMock = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('unexpected fetch'));
  });

  afterEach(() => {
    fetchMock.mockRestore();
    process.env = { ...originalEnv };
  });

  test('구글은 openid profile만 요청하고 이메일을 요청하지 않는다', () => {
    const url = new URL(oauthProviders.authorizationUrl('google', 'state-1', REDIRECT_URI));
    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.searchParams.get('scope')).toBe('openid profile');
    expect(url.searchParams.get('state')).toBe('state-1');
    expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT_URI);
    expect(url.searchParams.get('client_id')).toBe('google-id');
    expect(url.toString()).not.toContain('email');
  });

  test('카카오는 profile_nickname만 요청하고 이메일을 요청하지 않는다', () => {
    const url = new URL(oauthProviders.authorizationUrl('kakao', 'state-2', REDIRECT_URI));
    expect(url.origin).toBe('https://kauth.kakao.com');
    expect(url.searchParams.get('scope')).toBe('profile_nickname');
    expect(url.searchParams.get('state')).toBe('state-2');
    expect(url.toString()).not.toContain('email');
  });

  test('구글 코드 교환은 sub와 name을 돌려준다', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: 'access-1' }))
      .mockResolvedValueOnce(jsonResponse({ sub: 'google-user', name: '이름', email: 'x@y.z' }));

    await expect(oauthProviders.exchangeCode('google', 'code-1', REDIRECT_URI)).resolves.toEqual({
      providerUserId: 'google-user',
      displayName: '이름',
    });

    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0];
    expect(tokenUrl).toBe('https://oauth2.googleapis.com/token');
    expect(String(tokenInit.body)).toContain('code=code-1');
    const [, profileInit] = fetchMock.mock.calls[1];
    expect(profileInit.headers.Authorization).toBe('Bearer access-1');
  });

  test('카카오 코드 교환은 숫자 id를 문자열로 바꾸고 닉네임을 돌려준다', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: 'access-2' }))
      .mockResolvedValueOnce(
        jsonResponse({ id: 12345, kakao_account: { profile: { nickname: '별명' } } })
      );

    await expect(oauthProviders.exchangeCode('kakao', 'code-2', REDIRECT_URI)).resolves.toEqual({
      providerUserId: '12345',
      displayName: '별명',
    });
    expect(fetchMock.mock.calls[0][0]).toBe('https://kauth.kakao.com/oauth/token');
    expect(fetchMock.mock.calls[1][0]).toBe('https://kapi.kakao.com/v2/user/me');
  });

  test('제공자가 표시 이름을 주지 않으면 displayName은 null이다', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: 'access-3' }))
      .mockResolvedValueOnce(jsonResponse({ id: 777 }));

    await expect(oauthProviders.exchangeCode('kakao', 'code-3', REDIRECT_URI)).resolves.toEqual({
      providerUserId: '777',
      displayName: null,
    });
  });

  test.each(['google', 'kakao'] as const)(
    '%s 프로필에 고유 번호가 없으면 예외를 던진다',
    async (provider) => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ access_token: 'access-5' }))
        .mockResolvedValueOnce(jsonResponse({ name: '이름' }));
      await expect(oauthProviders.exchangeCode(provider, 'code-5', REDIRECT_URI)).rejects.toThrow();
    }
  );

  test('토큰 교환이 실패하면 예외를 던진다', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'invalid_grant' }, 400));
    await expect(oauthProviders.exchangeCode('google', 'bad', REDIRECT_URI)).rejects.toThrow();
  });

  test('프로필 조회가 실패하면 예외를 던진다', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: 'access-4' }))
      .mockResolvedValueOnce(jsonResponse({}, 500));
    await expect(oauthProviders.exchangeCode('kakao', 'code-4', REDIRECT_URI)).rejects.toThrow();
  });
});
