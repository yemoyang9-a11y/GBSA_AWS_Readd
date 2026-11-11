import { routePathFor, BOOK_ROUTES, APP_ROUTES, bookPath } from './routes';
import type { EntryResponse } from '../types';

function entry(overrides: Partial<EntryResponse> = {}): EntryResponse {
  return { route: 'briefing', page: 21, is_new_session: true, session_epoch: 7, ...overrides };
}

/**
 * 진입 라우팅 (FR-BRF-001, 자가 검증 17번)
 * 브리핑/읽기 판정은 서버가 한다 — 클라이언트는 응답의 route 를 그대로 따른다.
 */
describe('진입 라우팅', () => {
  it('서버가 briefing 이라고 하면 브리핑 화면으로 간다', () => {
    expect(routePathFor('takryu', entry({ route: 'briefing' }))).toBe('/books/takryu/briefing');
  });

  it('서버가 reader 라고 하면 읽기 화면으로 간다', () => {
    expect(routePathFor('takryu', entry({ route: 'reader' }))).toBe('/books/takryu/read');
  });

  it('is_new_session 이 true 여도 route 가 reader 면 읽기 화면으로 간다 — 클라이언트가 세션을 판정하지 않는다', () => {
    expect(routePathFor('takryu', entry({ route: 'reader', is_new_session: true }))).toBe(
      '/books/takryu/read'
    );
  });

  it('라우트 패턴은 한 곳에서만 정의한다', () => {
    expect(BOOK_ROUTES.briefing).toBe('/books/:bookId/briefing');
    expect(BOOK_ROUTES.reader).toBe('/books/:bookId/read');
  });
});

describe('최상위 경로', () => {
  test('bookPath: 책 id로 작품 페이지 주소를 만든다', () => {
    expect(bookPath('takryu')).toBe('/books/takryu');
  });

  test('FR-BRF-001: routePathFor는 서버가 준 route만 따른다', () => {
    expect(
      routePathFor('takryu', { route: 'briefing', page: 1, is_new_session: false, session_epoch: 1 })
    ).toBe('/books/takryu/briefing');
  });

  test('APP_ROUTES는 홈·검색·서재·MY·작품 주소를 정의한다', () => {
    expect(APP_ROUTES).toEqual({
      home: '/',
      search: '/search',
      shelf: '/shelf',
      my: '/my',
      book: '/books/:bookId',
    });
  });
});
