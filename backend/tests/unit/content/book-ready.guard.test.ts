/**
 * FR-BRW-002 🚦 — 미완비 도서는 API를 직접 호출해도 서버가 거절한다.
 * UI 차단만으로는 부족하다 (R4-frontend.md 자가 검증 25번).
 */

import type { Response } from 'express';
import { ensureBookReady } from '../../../src/api/book-ready.guard';
import type { ContentRepository } from '../../../src/modules/content/repository';

function repoWithReadiness(value: boolean | null): ContentRepository {
  return {
    findCatalog: async () => [],
    findReadiness: async () => value,
    findBasicInfo: async () => null,
    findChapters: async () => [],
    findBackgroundAndIntro: async () => ({ introduction: '', background: '' }),
    findPage: async () => null,
  };
}

interface SentResponse {
  status?: number;
  body?: { error?: string; message?: string };
}

function mockRes() {
  const sent: SentResponse = {};
  const res = {
    status(code: number) {
      sent.status = code;
      return res;
    },
    json(body: SentResponse['body']) {
      sent.body = body;
      return res;
    },
  };
  return { res: res as unknown as Response, sent };
}

describe('ensureBookReady', () => {
  test('완비 도서는 통과시킨다 (true, 응답 없음)', async () => {
    const { res, sent } = mockRes();

    expect(await ensureBookReady(repoWithReadiness(true), 'takryu', res)).toBe(true);
    expect(sent.status).toBeUndefined();
    expect(sent.body).toBeUndefined();
  });

  test('FR-BRW-002 🚦: 미완비 도서는 API를 직접 호출해도 403 BOOK_NOT_READY로 거절', async () => {
    const { res, sent } = mockRes();

    expect(await ensureBookReady(repoWithReadiness(false), 'takryu', res)).toBe(false);
    expect(sent.status).toBe(403);
    // 대문자 상수 — API_CONTRACT.md 에러 표 형식, R2 의 entry 거절과 같은 코드 (team-sync §4.2)
    expect(sent.body?.error).toBe('BOOK_NOT_READY');
  });

  test('없는 도서는 404 NOT_FOUND', async () => {
    const { res, sent } = mockRes();

    expect(await ensureBookReady(repoWithReadiness(null), 'nope', res)).toBe(false);
    expect(sent.status).toBe(404);
    expect(sent.body?.error).toBe('NOT_FOUND');
  });

  test('미완비와 부재를 구분한다 — 존재 여부를 403 으로 뭉뚱그리지 않는다', async () => {
    const notReady = mockRes();
    const missing = mockRes();

    await ensureBookReady(repoWithReadiness(false), 'takryu', notReady.res);
    await ensureBookReady(repoWithReadiness(null), 'nope', missing.res);

    expect(notReady.sent.status).not.toBe(missing.sent.status);
  });
});
