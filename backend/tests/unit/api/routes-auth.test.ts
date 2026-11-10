import express from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import router from '../../../src/api/routes';
import { handleQuery } from '../../../src/modules/chatbot/service';
import {
  listConversations,
  resolveConversation,
} from '../../../src/modules/chatbot/conversation-service';
import { checkRateLimit } from '../../../src/modules/llm-gateway/rate-limiter';
import { createReadingStateServices } from '../../../src/modules/reading-state/composition';
import { signSessionToken } from '../../../src/modules/auth/session-token';

jest.mock('../../../src/config/database', () => ({ pool: {} }));
jest.mock('../../../src/modules/reading-state/composition', () => ({
  createReadingStateServices: jest.fn(() => ({
    cutoffService: { getCutoffSnapshot: jest.fn() },
    progressService: { acceptProgressEvent: jest.fn() },
    sessionService: { touchActivity: jest.fn() },
    briefingService: { getBriefing: jest.fn() },
  })),
}));
jest.mock('../../../src/modules/content/composition', () => ({
  createContentServices: jest.fn(() => ({ pageService: { getPage: jest.fn(async () => null) } })),
}));
jest.mock('../../../src/modules/ssabi/composition', () => ({
  createSsabiServices: jest.fn(() => ({})),
}));
jest.mock('../../../src/modules/chatbot/conversation-service');
jest.mock('../../../src/modules/chatbot/service', () => ({ handleQuery: jest.fn() }));
jest.mock('../../../src/modules/llm-gateway/rate-limiter', () => ({ checkRateLimit: jest.fn() }));
jest.mock('../../../src/modules/feedback/resend-mailer', () => ({ sendFeedbackMail: jest.fn() }));

const TOKEN_READER = '33333333-3333-4333-8333-333333333333';
const OTHER_DEVICE = '55555555-5555-4555-8555-555555555555';

const services = (createReadingStateServices as jest.Mock).mock.results[0].value;

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use(router);
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  jest.clearAllMocks();
  process.env.AUTH_TOKEN_SECRET = 'test-only-signing-value-aaaaaaaaaaaa';
  services.cutoffService.getCutoffSnapshot.mockResolvedValue({
    current_page: 10,
    cutoff: 10,
    is_complete: false,
  });
  services.briefingService.getBriefing.mockResolvedValue({ applied_cutoff: 10 });
  (listConversations as jest.Mock).mockResolvedValue([]);
  (resolveConversation as jest.Mock).mockResolvedValue({ conversationId: 1, isNew: true });
  (checkRateLimit as jest.Mock).mockReturnValue({ allowed: true });
  (handleQuery as jest.Mock).mockImplementation(async function* () {
    yield 'answer';
  });
});

function token() {
  return signSessionToken({
    userId: '22222222-2222-4222-8222-222222222222',
    readerId: TOKEN_READER,
  });
}

function getBriefing(headers: Record<string, string>) {
  return fetch(`${baseUrl}/books/book/briefing`, { headers });
}

function postChat(headers: Record<string, string>) {
  return fetch(`${baseUrl}/books/book/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ query: '누구야' }),
  });
}

describe('routes — 독자 ID 치환', () => {
  test('로그인한 사용자가 다른 사람의 X-Device-Id를 보내도 토큰의 reader_id로 브리핑을 조회한다', async () => {
    const response = await getBriefing({
      Authorization: `Bearer ${await token()}`,
      'X-Device-Id': OTHER_DEVICE,
    });
    expect(response.status).toBe(200);
    expect(services.briefingService.getBriefing).toHaveBeenCalledWith(TOKEN_READER, 'book');
    expect(services.briefingService.getBriefing).not.toHaveBeenCalledWith(OTHER_DEVICE, 'book');
  });

  test('로그인한 사용자가 다른 사람의 X-Device-Id를 보내도 챗봇은 토큰의 reader_id를 쓴다', async () => {
    const response = await postChat({
      Authorization: `Bearer ${await token()}`,
      'X-Device-Id': OTHER_DEVICE,
    });
    await response.text();
    expect(response.status).toBe(200);
    expect(checkRateLimit).toHaveBeenCalledWith(TOKEN_READER, 'book');
    expect((handleQuery as jest.Mock).mock.calls[0][3]).toBe(TOKEN_READER);
  });

  test('X-Device-Id 없이 토큰만 보내도 챗봇은 동작한다', async () => {
    const response = await postChat({ Authorization: `Bearer ${await token()}` });
    await response.text();
    expect(response.status).toBe(200);
    expect((handleQuery as jest.Mock).mock.calls[0][3]).toBe(TOKEN_READER);
  });

  test('토큰이 위조되면 브리핑은 401이고 X-Device-Id로 조회하지 않는다', async () => {
    const response = await getBriefing({
      Authorization: 'Bearer forged',
      'X-Device-Id': OTHER_DEVICE,
    });
    expect(response.status).toBe(401);
    expect(services.briefingService.getBriefing).not.toHaveBeenCalled();
  });

  test('토큰이 위조되면 챗봇은 401이고 LLM 경로에 닿지 않는다', async () => {
    const response = await postChat({
      Authorization: 'Bearer forged',
      'X-Device-Id': OTHER_DEVICE,
    });
    expect(response.status).toBe(401);
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(handleQuery).not.toHaveBeenCalled();
  });

  test('토큰이 만료되면 대화 목록은 401이고 X-Device-Id로 조회하지 않는다', async () => {
    const expired = await signSessionToken(
      { userId: '22222222-2222-4222-8222-222222222222', readerId: TOKEN_READER },
      new Date(Date.now() - 31 * 24 * 60 * 60 * 1000)
    );
    const response = await fetch(`${baseUrl}/books/book/chat/conversations`, {
      headers: { Authorization: `Bearer ${expired}`, 'X-Device-Id': OTHER_DEVICE },
    });
    expect(response.status).toBe(401);
    expect(listConversations).not.toHaveBeenCalled();
  });

  test('토큰이 없으면 기존처럼 X-Device-Id로 브리핑을 조회한다', async () => {
    const response = await getBriefing({ 'X-Device-Id': OTHER_DEVICE });
    expect(response.status).toBe(200);
    expect(services.briefingService.getBriefing).toHaveBeenCalledWith(OTHER_DEVICE, 'book');
  });

  test('토큰이 없으면 기존처럼 X-Device-Id로 챗봇을 처리한다', async () => {
    const response = await postChat({ 'X-Device-Id': OTHER_DEVICE });
    await response.text();
    expect(response.status).toBe(200);
    expect((handleQuery as jest.Mock).mock.calls[0][3]).toBe(OTHER_DEVICE);
  });

  test('토큰도 X-Device-Id도 없으면 기존처럼 400이다', async () => {
    const briefing = await getBriefing({});
    const chat = await postChat({});
    expect(briefing.status).toBe(400);
    expect(chat.status).toBe(400);
  });

  test('만료된 토큰을 가진 사용자도 /auth/exchange로 다시 로그인할 수 있다', async () => {
    const response = await fetch(`${baseUrl}/auth/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer expired' },
      body: JSON.stringify({ code: 1 }),
    });
    expect(response.status).toBe(400);
  });
});
