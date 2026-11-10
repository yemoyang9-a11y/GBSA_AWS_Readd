import type { Server } from 'http';
import type { AddressInfo } from 'net';
import express from 'express';
import { FakeAccountRepository } from '../../../tests/unit/auth/fakes';
import { createAuthRouter } from './auth-router';
import { AuthService } from './auth.service';
import { signLoginState, signSessionToken, verifySessionToken } from './session-token';

const DEVICE_ID = '11111111-1111-4111-8111-111111111111';
const FRONTEND = 'https://app.test';
const API = 'https://api.test';

describe('auth router', () => {
  let server: Server;
  let baseUrl: string;
  let accounts: FakeAccountRepository;
  const exchangeCode = jest.fn();

  beforeEach(async () => {
    process.env.AUTH_TOKEN_SECRET = 'test-only-signing-value-aaaaaaaaaaaa';
    accounts = new FakeAccountRepository();
    exchangeCode.mockReset();
    exchangeCode.mockResolvedValue({ providerUserId: 'provider-1', displayName: '독자' });
    const app = express();
    app.use(express.json());
    app.use(
      createAuthRouter({
        service: new AuthService(accounts),
        providers: {
          authorizationUrl: (provider, state, redirectUri) =>
            `https://provider.test/${provider}?state=${encodeURIComponent(state)}&redirect_uri=${encodeURIComponent(redirectUri)}`,
          exchangeCode,
        },
        loadConfig: () => ({ frontendOrigin: FRONTEND, redirectBase: API }),
      })
    );
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve);
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    delete process.env.AUTH_TOKEN_SECRET;
    await new Promise((resolve) => server.close(resolve));
  });

  function get(path: string, headers: Record<string, string> = {}) {
    return fetch(`${baseUrl}${path}`, { headers, redirect: 'manual' });
  }

  async function startLogin(provider = 'google', deviceId = DEVICE_ID) {
    const response = await get(`/auth/${provider}/start?device_id=${deviceId}`);
    const location = new URL(response.headers.get('location') as string);
    const setCookie = response.headers.get('set-cookie') as string;
    return {
      response,
      location,
      setCookie,
      state: location.searchParams.get('state') as string,
      cookie: setCookie.split(';')[0],
    };
  }

  function callback(provider: string, query: Record<string, string>, cookie?: string) {
    const params = new URLSearchParams(query).toString();
    return get(`/auth/${provider}/callback?${params}`, cookie ? { Cookie: cookie } : {});
  }

  function exchange(code: unknown) {
    return fetch(`${baseUrl}/auth/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
  }

  async function loginAndGetToken(): Promise<string> {
    const { state, cookie } = await startLogin();
    const done = await callback('google', { state, code: 'provider-code' }, cookie);
    const code = new URLSearchParams(
      new URL(done.headers.get('location') as string).hash.slice(1)
    ).get('code');
    const body = (await (await exchange(code)).json()) as { token: string };
    return body.token;
  }

  describe('GET /auth/:provider/start', () => {
    test('제공자 로그인 화면으로 302하고 콜백 주소를 넘긴다', async () => {
      const { response, location } = await startLogin();
      expect(response.status).toBe(302);
      expect(location.origin).toBe('https://provider.test');
      expect(location.searchParams.get('redirect_uri')).toBe(`${API}/auth/google/callback`);
    });

    test('state 확인용 쿠키는 HttpOnly이고 SameSite=Lax다', async () => {
      const { setCookie } = await startLogin();
      expect(setCookie).toMatch(/HttpOnly/i);
      expect(setCookie).toMatch(/SameSite=Lax/i);
      expect(setCookie).toMatch(/Secure/i);
      expect(setCookie).toMatch(/Path=\/auth/i);
    });

    test('지원하지 않는 제공자는 404다', async () => {
      const response = await get(`/auth/naver/start?device_id=${DEVICE_ID}`);
      expect(response.status).toBe(404);
    });

    test('device_id가 UUID가 아니면 400이다', async () => {
      const response = await get('/auth/google/start?device_id=not-a-uuid');
      expect(response.status).toBe(400);
    });
  });

  describe('GET /auth/:provider/callback', () => {
    test('처음 로그인한 계정의 reader_id는 state의 device_id다', async () => {
      const token = await loginAndGetToken();
      const claims = await verifySessionToken(token);
      expect(claims?.readerId).toBe(DEVICE_ID);
    });

    test('성공하면 프런트 콜백 주소의 해시로 1회용 코드를 보낸다', async () => {
      const { state, cookie } = await startLogin();
      const response = await callback('google', { state, code: 'provider-code' }, cookie);
      const location = new URL(response.headers.get('location') as string);
      expect(response.status).toBe(302);
      expect(location.origin + location.pathname).toBe(`${FRONTEND}/auth/callback`);
      expect(new URLSearchParams(location.hash.slice(1)).get('code')).toBeTruthy();
      expect(location.search).toBe('');
    });

    test('제공자 코드 교환에는 같은 콜백 주소를 쓴다', async () => {
      const { state, cookie } = await startLogin('kakao');
      await callback('kakao', { state, code: 'provider-code' }, cookie);
      expect(exchangeCode).toHaveBeenCalledWith(
        'kakao',
        'provider-code',
        `${API}/auth/kakao/callback`
      );
    });

    test('state 서명이 맞지 않으면 콜백이 400이다', async () => {
      const { cookie } = await startLogin();
      const response = await callback('google', { state: 'forged', code: 'c' }, cookie);
      expect(response.status).toBe(400);
      expect(exchangeCode).not.toHaveBeenCalled();
    });

    test('state 쿠키가 없는 브라우저로 돌아오면 콜백이 400이다', async () => {
      const { state } = await startLogin();
      const response = await callback('google', { state, code: 'c' });
      expect(response.status).toBe(400);
      expect(exchangeCode).not.toHaveBeenCalled();
    });

    test('쿠키의 난수가 state와 다르면 콜백이 400이다', async () => {
      const { state } = await startLogin();
      const response = await callback('google', { state, code: 'c' }, 'ssabi_login_nonce=other');
      expect(response.status).toBe(400);
    });

    test('state의 제공자와 경로의 제공자가 다르면 콜백이 400이다', async () => {
      const { state, cookie } = await startLogin('google');
      const response = await callback('kakao', { state, code: 'c' }, cookie);
      expect(response.status).toBe(400);
    });

    test('제공자 화면에서 취소하면 오류 화면이 아니라 프런트로 #error=cancelled를 보낸다', async () => {
      const { state, cookie } = await startLogin();
      const response = await callback(
        'google',
        { state, error: 'access_denied', error_description: 'cancelled' },
        cookie
      );
      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe(`${FRONTEND}/auth/callback#error=cancelled`);
      expect(exchangeCode).not.toHaveBeenCalled();
      expect(accounts.accounts).toHaveLength(0);
    });

    test('제공자 코드 교환이 실패해도 프런트로 #error=cancelled를 보낸다', async () => {
      exchangeCode.mockRejectedValue(new Error('provider down'));
      const { state, cookie } = await startLogin();
      const response = await callback('google', { state, code: 'c' }, cookie);
      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe(`${FRONTEND}/auth/callback#error=cancelled`);
      expect(accounts.accounts).toHaveLength(0);
    });

    test('코드도 오류도 없으면 프런트로 #error=cancelled를 보낸다', async () => {
      const { state, cookie } = await startLogin();
      const response = await callback('google', { state }, cookie);
      expect(response.headers.get('location')).toBe(`${FRONTEND}/auth/callback#error=cancelled`);
    });

    test('만료된 state는 콜백이 400이다', async () => {
      const state = await signLoginState(
        { provider: 'google', deviceId: DEVICE_ID, nonce: 'n1' },
        new Date(Date.now() - 11 * 60 * 1000)
      );
      const response = await callback('google', { state, code: 'c' }, 'ssabi_login_nonce=n1');
      expect(response.status).toBe(400);
    });
  });

  describe('POST /auth/exchange', () => {
    test('1회용 코드는 두 번 쓸 수 없다', async () => {
      const { state, cookie } = await startLogin();
      const done = await callback('google', { state, code: 'provider-code' }, cookie);
      const code = new URLSearchParams(
        new URL(done.headers.get('location') as string).hash.slice(1)
      ).get('code');

      const first = await exchange(code);
      const second = await exchange(code);

      expect(first.status).toBe(200);
      await expect(first.json()).resolves.toMatchObject({ display_name: '독자' });
      expect(second.status).toBe(400);
    });

    test('code가 문자열이 아니면 400이다', async () => {
      const response = await exchange(123);
      expect(response.status).toBe(400);
    });
  });

  describe('/auth/me', () => {
    test('유효한 토큰이면 표시 이름과 제공자를 준다', async () => {
      const token = await loginAndGetToken();
      const response = await get('/auth/me', { Authorization: `Bearer ${token}` });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        display_name: '독자',
        providers: ['google'],
      });
    });

    test('토큰이 없으면 X-Device-Id가 있어도 401이다', async () => {
      const response = await get('/auth/me', { 'X-Device-Id': DEVICE_ID });
      expect(response.status).toBe(401);
    });

    test('위조된 토큰은 401이다', async () => {
      const response = await get('/auth/me', { Authorization: 'Bearer forged' });
      expect(response.status).toBe(401);
    });

    test('계정이 지워진 토큰은 401이다', async () => {
      const token = await signSessionToken({ userId: 'gone', readerId: DEVICE_ID });
      const response = await get('/auth/me', { Authorization: `Bearer ${token}` });
      expect(response.status).toBe(401);
    });

    test('탈퇴하면 204이고 계정과 독서 기록을 지운다', async () => {
      const token = await loginAndGetToken();
      const response = await fetch(`${baseUrl}/auth/me`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(response.status).toBe(204);
      expect(accounts.accounts).toHaveLength(0);
      expect(accounts.deletedReaders).toEqual([DEVICE_ID]);
      const after = await get('/auth/me', { Authorization: `Bearer ${token}` });
      expect(after.status).toBe(401);
    });

    test('토큰 없는 탈퇴는 401이고 아무것도 지우지 않는다', async () => {
      const token = await loginAndGetToken();
      const response = await fetch(`${baseUrl}/auth/me`, {
        method: 'DELETE',
        headers: { 'X-Device-Id': DEVICE_ID },
      });
      expect(response.status).toBe(401);
      expect(accounts.accounts).toHaveLength(1);
      expect(token).toBeTruthy();
    });
  });
});
