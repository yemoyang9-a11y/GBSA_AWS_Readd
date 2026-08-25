import type { BookSummary } from '../types';

/**
 * 데모 전용 서재 항목 — 실제 카탈로그(GET /books)가 아니다.
 *
 * 발표(8/28) 전까지 실제 도서는 「탁류」 1권뿐이라 서재 목록이 항상 비어 보인다.
 * 시안(2026-08-23 재설계)의 "내 서재" 구성을 데모에서 보여주기 위해 정적으로 둔
 * 항목이며, 서버에 존재하지 않으므로 진입(POST /entry)할 방법이 없다 — 클릭하면
 * 히어로 미리보기만 바뀌고 "이어서 읽기"는 막힌다(Dashboard.tsx 의 `enterable` 판정).
 *
 * cover_url 은 `frontend/public/covers/`에 둔 표지 이미지를 가리킨다(사용자가
 * 2026-08-23 직접 제공). 실제 API 자산이 아니라 정적 파일이므로 지어낸 데이터는 아니다.
 */
export const DEMO_SHELF_BOOKS: BookSummary[] = [
  {
    book_id: '__demo-demian',
    title: '데미안',
    author: '헤르만 헤세',
    cover_url: '/covers/demian.jpg',
    intro_summary: null,
    ssabi_ready: true,
    progress: { current_page: 184, percent: 61.8 },
  },
  {
    book_id: '__demo-pachinko',
    title: '파친코',
    author: '이민진',
    cover_url: '/covers/pachinko.jpg',
    intro_summary: null,
    ssabi_ready: true,
    progress: { current_page: 174, percent: 42.1 },
  },
];

/**
 * 데모 항목의 전체 페이지 수 — 실제 서버가 없어 GET /info로 물어볼 수 없다
 * (2026-08-25, ContinueReadingHero의 "N쪽" 표시를 현재 페이지 대신 전체 페이지 수로
 * 바꾸며 추가). 위 progress 값과 대략 맞아떨어지는 선에서 고정값을 둔다 — 실제 출간
 * 페이지 수와는 무관한 데모용 값이다.
 */
export const DEMO_TOTAL_PAGES: Record<string, number> = {
  '__demo-demian': 298,
  '__demo-pachinko': 413,
};
