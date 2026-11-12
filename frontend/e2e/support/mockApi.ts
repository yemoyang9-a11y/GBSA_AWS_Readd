import type { Page, Route } from '@playwright/test';
import type { BookInfoResponse, BookSummary, ChapterSummary } from '../../src/types';
import type { PositionResponse } from '../../src/services/positionService';
import { BOOK_ID, bookInfo, catalog, chapters, graph, pageResponse } from './fixtures';

export interface ApiLog {
  progress: number[];
  pageFetches: number[];
  entries: number;
  recapStreams: number;
  events: string[];
}

export interface MockApiOptions {
  startPage?: number;
  totalPages?: number;
  failPages?: number[];
  briefingRecap?: 'saved' | 'none' | 'first';
  progressDelayMs?: number;
  entryRoute?: 'reader' | 'briefing';
  failCatalog?: boolean;
  failEntry?: boolean;
  failBriefingTimes?: number;
  failInfo?: boolean;
  pageDelayMs?: number;
  authMember?: boolean;
  guest?: boolean;
  positions?: Record<string, PositionResponse>;
}

export const UNREAD_BOOK: BookSummary = {
  book_id: 'unread-book',
  title: '읽지 않은 책',
  author: '시험 작가',
  cover_url: '',
  intro_summary: null,
  ssabi_ready: true,
  genre: null,
  registered_at: '2026-11-01T00:00:00.000Z',
};

export const NOT_READY_BOOK: BookSummary = {
  book_id: 'not-ready-book',
  title: '검수 전 도서',
  author: '미상',
  cover_url: '',
  intro_summary: null,
  ssabi_ready: false,
  genre: null,
  registered_at: '2026-10-15T00:00:00.000Z',
};

export const DONE_BOOK: BookSummary = {
  book_id: 'done-book',
  title: '다 읽은 책',
  author: '시험 작가',
  cover_url: '',
  intro_summary: null,
  ssabi_ready: true,
  genre: '애정소설',
  registered_at: '2026-11-03T00:00:00.000Z',
  progress: { current_page: 20, percent: 100, is_complete: true, last_read_at: '2026-11-05T00:00:00.000Z' },
};

const LAST_READ_AT: Record<string, string> = {
  [BOOK_ID]: '2026-11-09T00:00:00.000Z',
  [DONE_BOOK.book_id]: DONE_BOOK.progress!.last_read_at,
};

function twoChapterInfo(title: string): BookInfoResponse {
  return {
    basic_info: { title, author: '시험 작가', published_year: 2026, length_note: '20페이지' },
    introduction: `${title}의 소개.`,
    background: `${title}의 배경 지식.`,
    chapters: [
      { chapter_no: 1, title: '첫째 장', start_page: 1, end_page: 10 },
      { chapter_no: 2, title: '둘째 장', start_page: 11, end_page: 20 },
    ],
  };
}

const EXTRA_INFO: Record<string, BookInfoResponse> = {
  [UNREAD_BOOK.book_id]: twoChapterInfo(UNREAD_BOOK.title),
  [DONE_BOOK.book_id]: twoChapterInfo(DONE_BOOK.title),
};

// FR-SPL-002 🚦
function positionAt(page: number | undefined, chapterList: ChapterSummary[]): PositionResponse {
  if (page === undefined) {
    return { applied_cutoff: 0, current_chapter_no: null, read_chapter_nos: [], is_complete: false };
  }
  const last = chapterList[chapterList.length - 1];
  return {
    applied_cutoff: page,
    current_chapter_no:
      chapterList.find((c) => page >= c.start_page && page <= c.end_page)?.chapter_no ?? null,
    read_chapter_nos: chapterList.filter((c) => c.end_page <= page).map((c) => c.chapter_no),
    is_complete: page >= last.end_page,
  };
}

// FR-BRF-005
function progressAt(
  page: number | undefined,
  totalPages: number,
  lastReadAt: string | undefined
): BookSummary['progress'] {
  if (page === undefined || lastReadAt === undefined) return undefined;
  return {
    current_page: page,
    percent: Math.round((page / totalPages) * 100),
    is_complete: page >= totalPages,
    last_read_at: lastReadAt,
  };
}

const API = 'http://api.e2e.test';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' },
    body: JSON.stringify(body),
  });
}

function sse(text: string, cutoff: number): string {
  const frames = [
    ...(text.match(/.{1,8}/gsu) ?? []).map((piece) => ({ type: 'delta', text: piece })),
    { type: 'done', applied_cutoff: cutoff },
  ];
  return frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join('');
}

export async function installMockApi(page: Page, opts: MockApiOptions = {}): Promise<ApiLog> {
  const totalPages = opts.totalPages ?? 30;
  const startPage = opts.startPage ?? 15;
  const failPages = new Set(opts.failPages ?? []);
  let briefingFailures = 0;
  const log: ApiLog = { progress: [], pageFetches: [], entries: 0, recapStreams: 0, events: [] };
  let consented = false;
  if (!opts.guest) {
    await page.addInitScript(() => {
      if (!localStorage.getItem('ssabi.auth_token')) localStorage.setItem('ssabi.auth_token', 'e2e-member');
    });
  }
  const briefingRecap = opts.briefingRecap ?? 'saved';
  let cutoff = startPage;
  const extraPages: Record<string, number | undefined> = { [DONE_BOOK.book_id]: 20 };
  const lastReadAt: Record<string, string | undefined> = { ...LAST_READ_AT };

  const chaptersOf = (bookId: string) =>
    bookId === BOOK_ID ? chapters(totalPages) : EXTRA_INFO[bookId].chapters;
  const pageOf = (bookId: string) => (bookId === BOOK_ID ? cutoff : extraPages[bookId]);
  const totalOf = (bookId: string) => {
    const list = chaptersOf(bookId);
    return list[list.length - 1].end_page;
  };
  const catalogBooks = (): BookSummary[] => [
    ...catalog().books.map((book) => ({
      ...book,
      genre: book.genre ?? null,
      registered_at: book.registered_at ?? '2026-10-01T00:00:00.000Z',
      progress: progressAt(pageOf(book.book_id), totalOf(book.book_id), lastReadAt[book.book_id]),
    })),
    NOT_READY_BOOK,
    { ...UNREAD_BOOK, progress: progressAt(pageOf(UNREAD_BOOK.book_id), totalOf(UNREAD_BOOK.book_id), lastReadAt[UNREAD_BOOK.book_id]) },
    { ...DONE_BOOK, progress: progressAt(pageOf(DONE_BOOK.book_id), totalOf(DONE_BOOK.book_id), lastReadAt[DONE_BOOK.book_id]) },
  ];
  const bookStatus = (bookId: string): 200 | 403 | 404 => {
    const book = catalogBooks().find((b) => b.book_id === bookId);
    if (!book) return 404;
    return book.ssabi_ready ? 200 : 403;
  };

  await page.route(`${API}/**`, async (route) => {
    const request = route.request();
    const method = request.method();
    const path = new URL(request.url()).pathname;

    if (method === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': '*',
          'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
        },
      });
    }

    if (method === 'GET' && path === '/books') {
      if (opts.failCatalog) return json(route, { error: 'E2E_FAIL' }, 500);
      return json(route, { books: catalogBooks() });
    }

    if (method === 'GET' && path === '/auth/me') {
      if (!opts.authMember) return json(route, { error: 'UNAUTHORIZED' }, 401);
      return json(route, { display_name: '시험 독자', providers: ['google'] });
    }

    const loginStart = path.match(/^\/auth\/(kakao|google)\/start$/);
    if (method === 'GET' && loginStart) {
      log.events.push(`login:${loginStart[1]}`);
      return route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: `<script>location.replace('http://localhost:4173/auth/callback#code=e2e-code')</script>`,
      });
    }
    if (method === 'POST' && path === '/auth/exchange') {
      return json(route, { token: 'e2e-member', display_name: '시험 독자', consent_required: !consented });
    }
    if (method === 'POST' && path === '/auth/consent') {
      log.events.push('consent');
      consented = true;
      return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
    }

    const match = path.match(/^\/books\/([^/]+)(\/.*)$/);
    const bookId = match?.[1] ?? '';
    const rest = match?.[2] ?? '';

    if (method === 'GET' && rest === '/position') {
      const status = bookStatus(bookId);
      if (status === 404) return json(route, { error: 'BOOK_NOT_FOUND' }, 404);
      if (status === 403) return json(route, { error: 'BOOK_NOT_READY' }, 403);
      return json(route, opts.positions?.[bookId] ?? positionAt(pageOf(bookId), chaptersOf(bookId)));
    }

    if (method === 'POST' && rest === '/entry') {
      log.entries += 1;
      log.events.push('entry');
      if (opts.failEntry) return json(route, { error: 'E2E_FAIL' }, 500);
      if (bookStatus(bookId) !== 200) return json(route, { error: 'BOOK_NOT_READY' }, 403);
      return json(route, {
        route: opts.entryRoute ?? 'reader',
        page: pageOf(bookId) ?? 1,
        is_new_session: false,
        session_epoch: 1,
      });
    }
    if (method === 'GET' && rest === '/info') {
      if (opts.failInfo) return json(route, { error: 'E2E_FAIL' }, 500);
      const status = bookStatus(bookId);
      if (status === 404) return json(route, { error: 'BOOK_NOT_FOUND' }, 404);
      if (status === 403) return json(route, { error: 'BOOK_NOT_READY' }, 403);
      return json(route, EXTRA_INFO[bookId] ?? bookInfo(totalPages));
    }
    if (method === 'GET' && rest === '/briefing') {
      if ((opts.failBriefingTimes ?? 0) > briefingFailures) {
        briefingFailures += 1;
        return json(route, { error: 'E2E_FAIL' }, 500);
      }
      if (briefingRecap === 'first') {
        return json(route, {
          applied_cutoff: 0,
          recap: null,
          current_chapter: { chapter_no: 1, title: '인간기념물' },
          progress: { current_page: 0, total_pages: totalPages, percent: 0 },
        });
      }
      return json(route, {
        applied_cutoff: cutoff,
        recap:
          briefingRecap === 'none'
            ? null
            : `${cutoff}페이지까지의 줄거리입니다. 정 주사는 미두장을 드나들며 재산을 잃고, 딸 초봉을 시집보내 형편을 펴 보려 한다.`,
        current_chapter: { chapter_no: 2, title: '생활 제일과' },
        progress: { current_page: cutoff, total_pages: totalPages, percent: Math.round((cutoff / totalPages) * 100) },
      });
    }

    const pageMatch = rest.match(/^\/pages\/(\d+)$/);
    if (method === 'GET' && pageMatch) {
      const pageNo = Number(pageMatch[1]);
      log.pageFetches.push(pageNo);
      if (failPages.has(pageNo)) return json(route, { error: 'E2E_FAIL' }, 500);
      if (opts.pageDelayMs && log.pageFetches.length > 1) await new Promise((r) => setTimeout(r, opts.pageDelayMs));
      return json(route, pageResponse(pageNo, totalPages));
    }

    if (method === 'POST' && rest === '/progress') {
      const body = request.postDataJSON() as { page: number };
      log.progress.push(body.page);
      log.events.push(`progress:${body.page}`);
      if (opts.progressDelayMs) await new Promise((resolve) => setTimeout(resolve, opts.progressDelayMs));
      log.events.push(`progress-done:${body.page}`);
      if (bookId in EXTRA_INFO) extraPages[bookId] = body.page;
      else cutoff = body.page;
      lastReadAt[bookId in EXTRA_INFO ? bookId : BOOK_ID] = new Date().toISOString();
      return json(route, { success: true, applied_cutoff: body.page });
    }
    if (method === 'POST' && rest === '/heartbeat') return json(route, {});
    if (method === 'GET' && rest === '/ssabi/graph') return json(route, { ...graph(), applied_cutoff: cutoff });
    if (method === 'GET' && rest === '/chat/conversations') return json(route, []);
    if (method === 'POST' && rest === '/recap/stream') {
      log.recapStreams += 1;
      return route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' },
        body: sse(`${cutoff}페이지까지의 줄거리입니다. 정 주사는 미두장을 드나들며 재산을 잃는다.`, cutoff),
      });
    }

    return json(route, { error: 'E2E_NOT_MOCKED', path }, 404);
  });

  return log;
}
