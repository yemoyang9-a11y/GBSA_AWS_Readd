/**
 * 도서·콘텐츠 조회 타입 — docs/api/API_CONTRACT.md 7~9번을 그대로 옮긴 것이다.
 * 계약에 없는 필드는 만들지 않는다 (CLAUDE.md 6장).
 */

/** GET /books 의 도서 1건 (FR-BRW-001·002) */
export interface BookSummary {
  book_id: string;
  title: string;
  author: string;
  cover_url: string;
  total_pages: number;
  /** 미완비 도서는 클릭 불가 + 서버도 거절 (FR-BRW-002 🚦) */
  ssabi_ready: boolean;
  /** 읽던 도서만 내려온다. percent 는 서버 계산값 — 재계산 금지 (FR-BRF-005 🚦) */
  progress?: {
    current_page: number;
    percent: number;
  };
}

export interface CatalogResponse {
  books: BookSummary[];
}

/** GET /books/:bookId/info — i 팝업. 3영역 분리 (FR-BRW-003 AC③) */
export interface BookInfoResponse {
  basic_info: {
    title: string;
    author: string;
    /** R1 확인(8/20): 연재 시작년 기준 1937 (team-sync-r4.md §2.1) */
    published_year: number;
    /**
     * FR-BRW-003 AC②의 4개 정보 항목 중 '분량'. total_pages(정수)와 별개로,
     * R1이 도서 소개용 짧은 문구로 채운다(예: "411페이지") — R4 확인(8/20).
     * 이 엔드포인트는 R4 소유라 필드 추가에 팀 합의가 필요 없다.
     * TODO DB 컬럼명이 확정되면 이 필드명을 맞춘다(현재는 가칭).
     */
    length_note: string;
  };
  /** 책 소개 — 상한 예외 (R5) */
  introduction: string;
  /** 배경지식 — 상한 예외 (R5) */
  background: string;
  /**
   * 목차 — 전체 상시 노출, 상한 없음 (FR-NAV-001). R2 승인(8/20, team-sync §4.1).
   * 장 경계 4개 필드만 담는다 — 여기 장 요약을 절대 넣지 않는다. 장 요약은 상한 대상이라
   * (`end_page <= K`인 장만 리캡에 투입, FR-SPL-003 🚦) 여기 섞이면 정적 캐시로 전량이
   * 프론트에 내려가 상한이 뚫린다.
   */
  chapters: ChapterSummary[];
}

export interface ChapterSummary {
  chapter_no: number;
  title: string;
  start_page: number;
  end_page: number;
}

/** GET /books/:bookId/pages/:pageNo — 본문 단건. 진도 무관, 선요청 안전 (FR-PRG-001) */
export interface PageResponse {
  page_no: number;
  content: string;
  /**
   * 이웃 페이지 번호. 없으면 null(첫/마지막 페이지).
   *
   * 계약 예시에는 없지만 R4 소유 엔드포인트라 R4가 정한다(§4.1 선례). 이 값을 서버가 주면
   * 프론트가 `page ± 1` 산술을 전혀 하지 않아도 되고, R2의 정적 게이트(파생값 단일 원천)와
   * 부딪히는 지점이 사라진다 — team-sync-r4.md §4.10.
   */
  prev_page: number | null;
  next_page: number | null;
  // TODO(계약 미확정) 본문 인물명 탭(FR-CHR-004 P0)에 필요한 alias_index 가 없다
  //   — team-sync-r4.md §4.4.
}
