/**
 * ② 독서 상태 서비스 — 리포지토리 계약 (R2)
 *
 * @see dev-spec-00-shared.md 2.2절 — 리포지토리 시그니처 규칙
 * @see architecture-r1.md 4.3절 · 5.1.2절
 *
 * ⚠️ 상한(cutoff)이 걸리는 저장소 접근은 전부 `findX(bookId, cutoff, ...)` 형태를 갖는다
 *    (FR-SPL-002 🚦). 이 파일의 함수들은 **상한이 걸리는 조회가 아니다** — 각각의 근거를
 *    시그니처마다 주석으로 남긴다. cutoff 인자가 없는 이유가 명시되지 않은 조회 함수를
 *    이 계층에 추가하지 않는다 (CP4 교차 리뷰 항목 1·2).
 */

/** 진도 테이블(reading_position)의 저장 레코드 — 5.1.2절 */
export interface StoredPosition {
  /** 마지막으로 열어본 페이지. 이 시스템의 유일한 저장값 (3.3절) */
  current_page: number

  /** 클라이언트 단조 증가 시퀀스. 순서 보장용 (FR-PRG-002) */
  event_seq: number
}

/** 장 경계 테이블에서 뽑은 장 식별 정보 */
export interface ChapterRef {
  chapter_no: number
  title: string
}

/**
 * 진도 리포지토리 — 독서 상태 스토어 (R2 소유, 쓰기 주체 ②)
 */
export interface ReadingPositionRepository {
  /**
   * (디바이스, 도서)의 저장 위치를 읽는다. 없으면 null (= 첫 진입).
   *
   * cutoff 인자 없음의 근거 — 이 조회가 **cutoff의 원천**이다. 상한을 적용받는 쪽이
   * 아니라 상한을 만들어내는 쪽이므로 상한 개념이 성립하지 않는다 (3.3절).
   */
  findPosition(deviceId: string, bookId: string): Promise<StoredPosition | null>
}

/**
 * 공개 콘텐츠 스토어 읽기 — 도서 메타·장 경계 (R1 소유 테이블, ②는 읽기 전용)
 *
 * 파생값 계산에 필요한 최소 두 가지만 노출한다. 본문·엔티티 조회는 ①③의 몫이다.
 */
export interface BookMetaReader {
  /**
   * 도서의 전체 페이지 수 — 진도 % 파생의 분모 (R2 불변식, MVP 1장). 도서가 없으면 null.
   *
   * cutoff 인자 없음의 근거 — 도서 메타이며 위치 값을 가진 레코드가 아니다.
   * 전체 페이지 수는 진도와 무관하게 대시보드에도 노출되는 값이다 (FR-BRW-001).
   */
  findTotalPages(bookId: string): Promise<number | null>

  /**
   * `pageNo`가 속한 장을 찾는다 (start_page <= pageNo <= end_page). 없으면 null.
   *
   * cutoff 인자 없음의 근거 — **목차는 전체 상시 노출**이므로 장 경계는 상한 대상이
   * 아니다 (R3 불변식, FR-SPL-001 주석 · FR-NAV-001). 상한이 걸리는 것은 장 *요약*이며
   * 그쪽은 리캡 조립에서 `end_page <= K`로 절단한다 (S5, FR-SPL-003 🚦).
   */
  findChapterContaining(bookId: string, pageNo: number): Promise<ChapterRef | null>
}
