import type { BookSummary } from '../types';

/**
 * 데모 전용 서재 항목 — 실제 카탈로그(GET /books)가 아니다.
 *
 * 발표(8/28) 전까지 실제 도서는 「탁류」 1권뿐이라 서재 목록이 항상 비어 보인다.
 * 시안(2026-08-23 재설계)의 "내 서재" 구성을 데모에서 보여주기 위해 정적으로 둔
 * 항목이며, 서버에 존재하지 않으므로 진입(POST /entry)할 방법이 없다 — 클릭하면
 * 히어로 미리보기만 바뀌고 "이어서 읽기"는 막힌다(Dashboard.tsx 의 `enterable` 판정).
 *
 * cover_url 을 비워 TypographicCover 폴백을 쓴다 — 실제 표지 에셋이 없어 지어내지 않는다.
 */
export const DEMO_SHELF_BOOKS: BookSummary[] = [
  {
    book_id: '__demo-demian',
    title: '데미안',
    author: '헤르만 헤세',
    cover_url: '',
    intro_summary: null,
    ssabi_ready: true,
    progress: { current_page: 184, percent: 61.8 },
  },
  {
    book_id: '__demo-pachinko',
    title: '파친코',
    author: '이민진',
    cover_url: '',
    intro_summary: null,
    ssabi_ready: true,
    progress: { current_page: 174, percent: 42.1 },
  },
];
