import type { EntryResponse } from '../types';

/** 라우트 패턴 — App 의 <Route path> 와 이동 경로가 같은 정의를 쓴다 */
export const BOOK_ROUTES = {
  briefing: '/books/:bookId/briefing',
  reader: '/books/:bookId/read',
} as const;

/**
 * 진입 후 어느 화면으로 갈지 (FR-BRF-001)
 *
 * 세션 30분 규칙은 서버가 평가한다. 클라이언트는 `route` 를 그대로 따르며 is_new_session
 * 같은 다른 필드로 다시 판정하지 않는다 (절대 규칙 8번, 자가 검증 17번).
 */
export function routePathFor(bookId: string, entry: EntryResponse): string {
  const pattern = entry.route === 'briefing' ? BOOK_ROUTES.briefing : BOOK_ROUTES.reader;
  return pattern.replace(':bookId', bookId);
}
