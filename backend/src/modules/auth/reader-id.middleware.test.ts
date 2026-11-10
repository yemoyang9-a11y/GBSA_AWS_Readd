import type { Server } from 'http';
import type { AddressInfo } from 'net';
import express from 'express';
import {
  attachReaderIdentity,
  resolveReaderId,
  resolveWriterDeviceId,
} from './reader-id.middleware';
import { signSessionToken } from './session-token';

const TOKEN_READER_ID = '33333333-3333-4333-8333-333333333333';
const HEADER_DEVICE_ID = '55555555-5555-4555-8555-555555555555';
const CLAIMS = { userId: '22222222-2222-4222-8222-222222222222', readerId: TOKEN_READER_ID };

describe('reader-id.middleware', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll((done) => {
    process.env.AUTH_TOKEN_SECRET = 'test-only-signing-value-aaaaaaaaaaaa';
    const app = express();
    app.get('/who', attachReaderIdentity(), (req, res) => {
      res.json({ reader_id: resolveReaderId(req) ?? null });
    });
    app.get('/writer', attachReaderIdentity(), (req, res) => {
      res.json({ writer: resolveWriterDeviceId(req) });
    });
    server = app.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      done();
    });
  });

  afterAll((done) => {
    delete process.env.AUTH_TOKEN_SECRET;
    server.close(done);
  });

  function who(headers: Record<string, string>) {
    return fetch(`${baseUrl}/who`, { headers });
  }

  test('토큰이 유효하면 헤더의 X-Device-Id를 무시하고 토큰의 reader_id를 쓴다', async () => {
    const token = await signSessionToken(CLAIMS);
    const response = await who({
      Authorization: `Bearer ${token}`,
      'X-Device-Id': HEADER_DEVICE_ID,
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ reader_id: TOKEN_READER_ID });
  });

  test('토큰이 무효면 401이고 X-Device-Id로 넘어가지 않는다', async () => {
    const response = await who({
      Authorization: 'Bearer forged.token.value',
      'X-Device-Id': HEADER_DEVICE_ID,
    });
    expect(response.status).toBe(401);
    expect(JSON.stringify(await response.json())).not.toContain(HEADER_DEVICE_ID);
  });

  test('토큰이 만료되면 401이고 X-Device-Id로 넘어가지 않는다', async () => {
    const token = await signSessionToken(CLAIMS, new Date(Date.now() - 31 * 24 * 60 * 60 * 1000));
    const response = await who({
      Authorization: `Bearer ${token}`,
      'X-Device-Id': HEADER_DEVICE_ID,
    });
    expect(response.status).toBe(401);
  });

  test('Bearer 형식이 아닌 Authorization 헤더는 401이다', async () => {
    const response = await who({ Authorization: 'Basic abc', 'X-Device-Id': HEADER_DEVICE_ID });
    expect(response.status).toBe(401);
  });

  test('토큰이 없으면 기존처럼 X-Device-Id를 쓴다', async () => {
    const response = await who({ 'X-Device-Id': HEADER_DEVICE_ID });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ reader_id: HEADER_DEVICE_ID });
  });

  test('토큰도 X-Device-Id도 없으면 독자 ID가 없다', async () => {
    const response = await who({});
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ reader_id: null });
  });

  describe('resolveWriterDeviceId', () => {
    async function writer(headers: Record<string, string>) {
      const response = await fetch(`${baseUrl}/writer`, { headers });
      expect(response.status).toBe(200);
      return ((await response.json()) as { writer: string | null }).writer;
    }

    test('FR-PRG-003: 로그인 요청은 UUID 형식의 X-Device-Id를 쓴 기기로 쓴다', async () => {
      const token = await signSessionToken(CLAIMS);
      await expect(
        writer({ Authorization: `Bearer ${token}`, 'X-Device-Id': HEADER_DEVICE_ID })
      ).resolves.toBe(HEADER_DEVICE_ID);
    });

    test('FR-PRG-003: 로그인 요청에 X-Device-Id가 없으면 reader_id를 쓴 기기로 쓴다', async () => {
      const token = await signSessionToken(CLAIMS);
      await expect(writer({ Authorization: `Bearer ${token}` })).resolves.toBe(TOKEN_READER_ID);
    });

    test('FR-PRG-003: 로그인 요청의 X-Device-Id가 UUID가 아니면 reader_id를 쓴 기기로 쓴다', async () => {
      const token = await signSessionToken(CLAIMS);
      await expect(
        writer({ Authorization: `Bearer ${token}`, 'X-Device-Id': 'not-a-uuid' })
      ).resolves.toBe(TOKEN_READER_ID);
    });

    test('FR-PRG-003: 비로그인 요청은 UUID 형식의 X-Device-Id를 쓴 기기로 쓴다', async () => {
      await expect(writer({ 'X-Device-Id': HEADER_DEVICE_ID })).resolves.toBe(HEADER_DEVICE_ID);
    });

    test('FR-PRG-003: 비로그인 요청의 X-Device-Id가 UUID가 아니면 쓴 기기를 비운다', async () => {
      await expect(writer({ 'X-Device-Id': 'not-a-uuid' })).resolves.toBeNull();
    });
  });
});
