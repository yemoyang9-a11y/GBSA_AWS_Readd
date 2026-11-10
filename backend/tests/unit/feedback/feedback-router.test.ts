import express from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { createFeedbackRouter } from '../../../src/modules/feedback/feedback-router';

const ONE_HOUR_MS = 60 * 60 * 1000;
const START = 1_000_000;

let server: Server;
let baseUrl: string;
let clock: number;
const sendMail = jest.fn<Promise<void>, [string]>();

beforeEach(async () => {
  clock = START;
  sendMail.mockReset();
  sendMail.mockResolvedValue(undefined);
  const app = express();
  app.use(express.json());
  app.use(createFeedbackRouter({ sendMail, now: () => clock }));
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
});

function post(body: unknown, clientIp = '203.0.113.1') {
  return fetch(`${baseUrl}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Fly-Client-IP': clientIp },
    body: JSON.stringify(body),
  });
}

describe('POST /feedback validation', () => {
  test('accepted feedback is mailed once with surrounding whitespace removed', async () => {
    const response = await post({ message: '  글자가 작아요\n' });

    expect(response.status).toBe(200);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledWith('글자가 작아요');
  });

  test.each([
    ['empty string', { message: '' }],
    ['whitespace only', { message: ' \n\t ' }],
    ['non-string', { message: 123 }],
    ['missing field', {}],
  ])('%s is rejected without sending mail', async (_name, body) => {
    const response = await post(body);

    expect(response.status).toBe(400);
    expect(sendMail).not.toHaveBeenCalled();
  });

  test('message of exactly 2000 characters is accepted', async () => {
    const response = await post({ message: '가'.repeat(2000) });

    expect(response.status).toBe(200);
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  test('message of 2001 characters is rejected without sending mail', async () => {
    const response = await post({ message: '가'.repeat(2001) });

    expect(response.status).toBe(400);
    expect(sendMail).not.toHaveBeenCalled();
  });

  test('rejected input does not use up the request quota', async () => {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await post({ message: '' });
    }

    const response = await post({ message: '정상 의견' });

    expect(response.status).toBe(200);
  });
});

describe('POST /feedback rate limit', () => {
  test('sixth request from one client within an hour is refused and sends no mail', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await post({ message: `의견 ${attempt}` })).status).toBe(200);
    }

    const refused = await post({ message: '여섯 번째' });

    expect(refused.status).toBe(429);
    expect(sendMail).toHaveBeenCalledTimes(5);
  });

  test('refusal reports the seconds until the oldest request leaves the window', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await post({ message: `의견 ${attempt}` });
    }
    clock = START + 10 * 60 * 1000;

    const refused = await post({ message: '여섯 번째' });

    expect(await refused.json()).toMatchObject({ error: 'RATE_LIMIT', retry_after: 3000 });
  });

  test('one client reaching its limit does not block another client', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await post({ message: `의견 ${attempt}` });
    }

    const other = await post({ message: '다른 사람' }, '203.0.113.2');

    expect(other.status).toBe(200);
  });

  test('client is allowed again only after the hour has fully passed', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await post({ message: `의견 ${attempt}` });
    }

    clock = START + ONE_HOUR_MS - 1;
    expect((await post({ message: '아직 안 됨' })).status).toBe(429);

    clock = START + ONE_HOUR_MS;
    expect((await post({ message: '이제 됨' })).status).toBe(200);
  });

  test('twenty-first request overall is refused even from a new client', async () => {
    for (let client = 0; client < 20; client += 1) {
      expect((await post({ message: '의견' }, `203.0.113.${client + 10}`)).status).toBe(200);
    }

    const refused = await post({ message: '스물한 번째' }, '198.51.100.1');

    expect(refused.status).toBe(429);
    expect(sendMail).toHaveBeenCalledTimes(20);
  });
});

describe('POST /feedback send failure', () => {
  test('failed send answers 502 without exposing the provider error', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    sendMail.mockRejectedValue(new Error('Resend responded 403: secret detail'));

    const response = await post({ message: '보내지지 않을 의견' });

    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain('secret detail');
    consoleError.mockRestore();
  });
});
