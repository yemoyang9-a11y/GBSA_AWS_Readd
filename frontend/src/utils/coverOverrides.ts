/**
 * 표지 override — 실제 API의 cover_url이 비어 있을 때만 화면에서 대신 채운다.
 * 서버 응답을 고치는 게 아니라 표시만 바꾸는 것이라 지어낸 데이터는 아니다.
 * R1 파이프라인이 실제 cover_url을 채워주면 이 표는 지운다.
 *
 * 대시보드 재설계(2026-08-23)에서 처음 만들었고, 브리핑 재설계에서 두 번째로 쓰게 되면서
 * 공용 유틸로 뽑았다(DRY) — `GET /books`(BookSummary)와 `GET /books/:id/info`
 * (BookInfoResponse.basic_info) 둘 다 cover_url이 없거나 비어 있을 수 있다.
 */
const COVER_OVERRIDES: Record<string, string> = {
  takryu: '/covers/takryu.jpg',
  // 배포 카탈로그의 자리표시자 행을 실제 도서로 채우며 추가(2026-08-26, 사용자 제공 이미지).
  // 제목·저자는 표시만 바꿀 수 없어 RDS 쪽을 직접 갱신했고, 표지는 이 표에 둔다 —
  // cover_url을 DB에 넣으면 정적 파일 경로가 DB에 박혀 프론트 배포와 어긋날 수 있다.
  'test-book-1': '/covers/tonight-this-love.webp',
  'test-book-2': '/covers/sherlock-holmes.webp',
};

export function resolveCoverUrl(
  bookId: string,
  coverUrl: string | null | undefined
): string | null {
  if (!coverUrl && COVER_OVERRIDES[bookId]) return COVER_OVERRIDES[bookId];
  return coverUrl ?? null;
}
