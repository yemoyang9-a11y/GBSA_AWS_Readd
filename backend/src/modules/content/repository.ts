/**
 * ① 콘텐츠 조회 포트 (R4)
 *
 * @see docs/dev-specs/R4-frontend.md S1
 * @see backend/migrations/001_content_store.sql — 컬럼명 정본 (R1 소유, 읽기 전용)
 *
 * ⚠️ 이 파일의 조회 함수에는 cutoff 인자가 없다. 00-shared §2.2의 예외이며,
 *    근거를 함수별로 명시한다 — 예외를 사유 없이 두면 CP4 교차 리뷰(R2)에서
 *    FR-SPL-002 🚦 위반으로 잡혀야 정상이다.
 *      · 배경지식·소개 : 상한 대상이 아니다 (R5, FR-BGK-002 🚦)
 *      · 목차          : 전체 상시 노출 (FR-NAV-001, R3)
 *      · 본문 페이지    : 본문 접근은 제한하지 않는다 (R3, FR-SPL-001)
 *      · 카탈로그       : 도서 메타데이터에 위치 값이 없다
 *
 * 싸비 조회(③)는 이와 반대다 — `modules/ssabi/repository.ts`의 모든 메서드가
 * cutoff 인자를 갖는다 (계획 G1).
 */

/** GET /books 의 도서 1건 */
export interface BookCatalogRow {
  book_id: string;
  title: string;
  author: string;
  cover_url: string | null;
  /**
   * 카드 소개 2줄. 출처는 `background_and_intro` 의 `kind='intro'` 행이다 (D-3 확정, 2026-08-21).
   * `books.intro_summary` 컬럼은 001 DDL 에 선언만 있고 파이프라인이 채우지 않는 죽은 컬럼이므로
   * 참조하지 않는다. 상한 예외 콘텐츠라 기준점과 무관하다 (R5).
   */
  intro_summary: string | null;
  ssabi_ready: boolean;
}

/**
 * GET /books/{b}/info 의 basic_info
 *
 * `total_pages` 는 **여기에만** 있다. `GET /books` 응답에는 넣지 않는다 (D-1 확정, team-sync §4.5) —
 * `progress.current_page` 와 함께 있으면 프론트가 퍼센트를 재계산할 재료가 된다 (절대 규칙 2번).
 */
export interface BookBasicRow {
  title: string;
  author: string;
  publish_year: number | null;
  /** FR-BRW-003 AC② '분량' — 소개용 문구("411페이지"). total_pages 와 별개 컬럼 */
  extent: string | null;
  total_pages: number;
}

/** 목차 1행 — 장 요약을 절대 넣지 않는다 (team-sync §4.1 R2 조건) */
export interface ChapterRow {
  chapter_no: number;
  title: string;
  start_page: number;
  end_page: number;
}

/** 본문 단건 + 이웃 페이지 (team-sync §4.10) */
export interface PageRow {
  page_no: number;
  content: string;
  prev_page: number | null;
  next_page: number | null;
}

export interface BackgroundAndIntro {
  introduction: string;
  background: string;
}

export interface ContentRepository {
  /** 전 도서. 미완비 도서도 포함해 내려보낸다 — 대시보드가 표지만 띄우고 잠그기 위해서다 (S2) */
  findCatalog(): Promise<BookCatalogRow[]>;

  /** 미완비 판정용. 도서가 없으면 null (FR-BRW-002 🚦) */
  findReadiness(bookId: string): Promise<boolean | null>;

  findBasicInfo(bookId: string): Promise<BookBasicRow | null>;

  /** 상한 없음 — FR-NAV-001, R3 */
  findChapters(bookId: string): Promise<ChapterRow[]>;

  /** 상한 없음 — R5, FR-BGK-002 🚦. 행이 없으면 빈 문자열 */
  findBackgroundAndIntro(bookId: string): Promise<BackgroundAndIntro>;

  /** 상한 없음 — R3. 해당 페이지가 없으면 null */
  findPage(bookId: string, pageNo: number): Promise<PageRow | null>;
}
