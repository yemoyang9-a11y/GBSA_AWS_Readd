import { AxiosError, type AxiosAdapter } from 'axios';
import { api } from './api';
import { askChatbot } from './chatbotService';
import { streamRecap } from './recapService';
import { buildLoginUrl } from './authService';
import { getAuthToken, setAuthToken } from '../utils/storage';

vi.mock('../utils/constants', async (original) => ({
  ...(await original<typeof import('../utils/constants')>()),
  USE_MOCK: false,
  API_BASE_URL: 'https://api.test',
}));

const okAdapter: AxiosAdapter = async (config) => ({
  data: {},
  status: 200,
  statusText: 'OK',
  headers: {},
  config,
});

function failWith(status: number): AxiosAdapter {
  return async (config) => {
    const response = { data: {}, status, statusText: 'x', headers: {}, config };
    throw new AxiosError('failed', 'ERR_BAD_REQUEST', config, null, response);
  };
}

function headersOf(call: unknown[]): Record<string, string> {
  return (call[1] as RequestInit).headers as Record<string, string>;
}

async function drain(stream: AsyncGenerator<unknown>) {
  const frames: unknown[] = [];
  for await (const frame of stream) frames.push(frame);
  return frames;
}

describe('Authorization 헤더', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    fetchMock = vi.fn(async () => new Response(null, { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('토큰이 있으면 api 요청에 Authorization을 붙인다', async () => {
    setAuthToken('jwt');
    const { config } = await api.get('/x', { adapter: okAdapter });
    expect(config.headers.Authorization).toBe('Bearer jwt');
    expect(config.headers['X-Device-Id']).toBeTruthy();
  });

  it('토큰이 없으면 api 요청에 Authorization을 붙이지 않는다', async () => {
    const { config } = await api.get('/x', { adapter: okAdapter });
    expect(config.headers.Authorization).toBeUndefined();
    expect(config.headers['X-Device-Id']).toBeTruthy();
  });

  it('api 요청이 401이면 토큰을 지운다', async () => {
    setAuthToken('jwt');
    await expect(api.get('/x', { adapter: failWith(401) })).rejects.toThrow();
    expect(getAuthToken()).toBeNull();
  });

  it('api 요청이 500이면 토큰을 유지한다', async () => {
    setAuthToken('jwt');
    await expect(api.get('/x', { adapter: failWith(500) })).rejects.toThrow();
    expect(getAuthToken()).toBe('jwt');
  });

  it('챗봇 스트림 요청에 토큰이 있으면 Authorization을 붙인다', async () => {
    setAuthToken('jwt');
    await drain(askChatbot('book', 'q', 1, 1));
    expect(headersOf(fetchMock.mock.calls[0]).Authorization).toBe('Bearer jwt');
  });

  it('챗봇 스트림 요청에 토큰이 없으면 Authorization을 붙이지 않는다', async () => {
    await drain(askChatbot('book', 'q', 1, 1));
    expect(headersOf(fetchMock.mock.calls[0]).Authorization).toBeUndefined();
  });

  it('리캡 스트림 요청에 토큰이 있으면 Authorization을 붙인다', async () => {
    setAuthToken('jwt');
    await drain(streamRecap('book', 1, 1));
    expect(headersOf(fetchMock.mock.calls[0]).Authorization).toBe('Bearer jwt');
  });

  it('리캡 스트림 요청에 토큰이 없으면 Authorization을 붙이지 않는다', async () => {
    await drain(streamRecap('book', 1, 1));
    expect(headersOf(fetchMock.mock.calls[0]).Authorization).toBeUndefined();
  });

  it.each([
    ['챗봇', () => askChatbot('book', 'q', 1, 1)],
    ['리캡', () => streamRecap('book', 1, 1)],
  ])('%s 스트림이 401이면 토큰을 지우고 error 프레임을 준다', async (_name, open) => {
    setAuthToken('jwt');
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
    const frames = await drain(open());
    expect(getAuthToken()).toBeNull();
    expect(frames).toEqual([expect.objectContaining({ type: 'error' })]);
  });

  it('로그인 시작 주소에 제공자와 이 기기의 device_id가 들어간다', async () => {
    const { config } = await api.get('/x', { adapter: okAdapter });
    const deviceId = config.headers['X-Device-Id'] as string;
    expect(buildLoginUrl('kakao')).toBe(
      `https://api.test/auth/kakao/start?device_id=${encodeURIComponent(deviceId)}`
    );
  });
});
