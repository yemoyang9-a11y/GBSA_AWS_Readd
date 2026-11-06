import type { Page, Route } from '@playwright/test';
import { bookInfo, catalog, graph, pageResponse } from './fixtures';

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
  const log: ApiLog = { progress: [], pageFetches: [], entries: 0, recapStreams: 0, events: [] };
  const briefingRecap = opts.briefingRecap ?? 'saved';
  let cutoff = startPage;

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

    if (method === 'GET' && path === '/books') return json(route, catalog());

    const match = path.match(/^\/books\/[^/]+(\/.*)$/);
    const rest = match?.[1] ?? '';

    if (method === 'POST' && rest === '/entry') {
      log.entries += 1;
      log.events.push('entry');
      return json(route, { route: opts.entryRoute ?? 'reader', page: cutoff, is_new_session: false, session_epoch: 1 });
    }
    if (method === 'GET' && rest === '/info') return json(route, bookInfo(totalPages));
    if (method === 'GET' && rest === '/briefing') {
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
      return json(route, pageResponse(pageNo, totalPages));
    }

    if (method === 'POST' && rest === '/progress') {
      const body = request.postDataJSON() as { page: number };
      log.progress.push(body.page);
      log.events.push(`progress:${body.page}`);
      if (opts.progressDelayMs) await new Promise((resolve) => setTimeout(resolve, opts.progressDelayMs));
      log.events.push(`progress-done:${body.page}`);
      cutoff = body.page;
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
